import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiUrl = vi.hoisted(() => ({ value: 'https://cms.example.com' }));

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, getApiUrl: () => apiUrl.value, api: { get: vi.fn(), post: vi.fn() } };
});

const access = { can: vi.fn(() => true), known: true, viewer: { roles: [] as string[] } };
vi.mock('@/hooks/use-access', () => ({ useAccess: () => access }));
vi.mock('@/hooks/use-tenants', () => ({
    useCurrentTenant: () => 'acme',
    useMyTenants: () => ({ data: [{ slug: 'acme', name: 'Acme Co', branding: {} }] }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const toDataURL = vi.fn(async (text: string) => (void text, 'data:image/png;base64,AAAA'));
vi.mock('qrcode', () => ({ default: { toDataURL: (text: string) => toDataURL(text) } }));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { ConnectPhone } = await import('./connect-phone');

const T0 = new Date('2026-11-18T10:00:00Z').getTime();
const started = (ms = 5 * 60_000) => ({
    data: { id: 'p1', code: 'ABCDEFGH2345', expiresAt: new Date(T0 + ms).toISOString() },
});

function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(React.createElement(QueryClientProvider, { client }, React.createElement(ConnectPhone)));
    return { invalidate };
}

async function openDialog() {
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Connect a phone' }));
    });
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
}

describe('Connect a phone', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
        access.can.mockReturnValue(true);
        apiUrl.value = 'https://cms.example.com';
        vi.mocked(api.post).mockReset();
        vi.mocked(api.get).mockReset();
        toDataURL.mockClear();
        vi.mocked(api.post).mockResolvedValue(started());
        vi.mocked(api.get).mockResolvedValue({
            data: { id: 'p1', expiresAt: started().data.expiresAt, redeemedAt: null, keyId: null },
        });
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('hides the button without permission to create keys', () => {
        access.can.mockReturnValue(false);
        mount();
        expect(screen.queryByRole('button', { name: 'Connect a phone' })).toBeNull();
    });

    it('makes one code on a click, even when the button is clicked twice quickly', async () => {
        mount();
        const button = screen.getByRole('button', { name: 'Connect a phone' });
        expect(api.post).not.toHaveBeenCalled();
        await act(async () => {
            fireEvent.click(button);
            fireEvent.click(button);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(api.post).toHaveBeenCalledTimes(1);
    });

    it('shows a message and makes no code for an http address that is not local', async () => {
        apiUrl.value = 'http://cms.example.com';
        mount();
        await openDialog();
        expect(screen.getByText('A phone can only connect over https. This address is not https.')).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
        expect(screen.queryByAltText('QR code to connect a phone')).toBeNull();
        expect(toDataURL).not.toHaveBeenCalled();
    });

    it('allows http for localhost', async () => {
        apiUrl.value = 'http://localhost:5005';
        mount();
        await openDialog();
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(screen.getByAltText('QR code to connect a phone')).toBeInTheDocument();
    });

    it('asks for a code and renders a QR of the link, without showing the code', async () => {
        mount();
        await openDialog();
        expect(api.post).toHaveBeenCalledWith('/api/api-keys/pairings', { name: 'Phone' });
        expect(screen.getByAltText('QR code to connect a phone')).toBeInTheDocument();
        const link = toDataURL.mock.calls.at(-1)![0];
        expect(link.startsWith('togo://connect?v=2&')).toBe(true);
        const q = new URLSearchParams(link.split('?')[1]);
        expect(q.get('url')).toBe('https://cms.example.com');
        expect(q.get('tenant')).toBe('acme');
        expect(q.get('name')).toBe('Acme Co');
        expect(q.get('code')).toBe('ABCDEFGH2345');
        expect(q.get('exp')).toBe(String(Math.floor((T0 + 5 * 60_000) / 1000)));
        expect(document.body.textContent).not.toContain('ABCDEFGH2345');
        expect(screen.getByTestId('pairing-countdown')).toHaveTextContent('5:00');
    });

    it('shows the expired state and stops polling when the code runs out', async () => {
        vi.mocked(api.post).mockResolvedValue(started(10_000));
        mount();
        await openDialog();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(11_000);
        });
        expect(screen.getByText('Code expired')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New code' })).toBeInTheDocument();
        const polls = vi.mocked(api.get).mock.calls.length;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(vi.mocked(api.get).mock.calls.length).toBe(polls);
    });

    it('asks for a new code from the expired state', async () => {
        vi.mocked(api.post).mockResolvedValueOnce(started(5_000));
        mount();
        await openDialog();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(6_000);
        });
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { id: 'p2', code: 'ZZZZZZZZ2222', expiresAt: new Date(T0 + 6_000 + 300_000).toISOString() },
        });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'New code' }));
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(api.post).toHaveBeenCalledTimes(2);
        expect(screen.getByAltText('QR code to connect a phone')).toBeInTheDocument();
    });

    it('polls every two seconds, then shows connected and reloads the key list', async () => {
        const { invalidate } = mount();
        await openDialog();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2_000);
        });
        expect(api.get).toHaveBeenCalledWith('/api/api-keys/pairings/p1');
        vi.mocked(api.get).mockResolvedValue({
            data: { id: 'p1', expiresAt: started().data.expiresAt, redeemedAt: '2026-11-18T10:00:05Z', keyId: 'k1' },
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2_000);
        });
        expect(screen.getByText('Phone connected')).toBeInTheDocument();
        expect(screen.queryByAltText('QR code to connect a phone')).toBeNull();
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['api-keys'] });
        const polls = vi.mocked(api.get).mock.calls.length;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(vi.mocked(api.get).mock.calls.length).toBe(polls);
    });
});
