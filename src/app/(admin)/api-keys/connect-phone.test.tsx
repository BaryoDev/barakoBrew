import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const access = { can: vi.fn(() => true), known: true, viewer: { roles: [] as string[] } };
vi.mock('@/hooks/use-access', () => ({ useAccess: () => access }));
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => 'acme' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const toDataURL = vi.fn(async (text: string) => (void text, 'data:image/png;base64,AAAA'));
vi.mock('qrcode', () => ({ default: { toDataURL: (text: string) => toDataURL(text) } }));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { MODULES_KEY } = await import('@/hooks/use-modules');
const { ConnectPhone } = await import('./connect-phone');

const T0 = new Date('2026-11-18T10:00:00Z').getTime();
const LINK = 'togo://connect?v=2&url=https%3A%2F%2Fcms.example.com&tenant=acme&name=Acme&code=SERVERCODE12&exp=1';

const started = (extra: Record<string, unknown> = {}, ms = 120_000) => ({
    data: {
        id: 'p1',
        instanceUrl: 'https://cms.example.com',
        tenant: 'acme',
        instanceName: 'Acme',
        code: 'SERVERCODE12',
        expiresAt: new Date(T0 + ms).toISOString(),
        expiresInSeconds: ms / 1000,
        link: LINK,
        warning: null,
        ...extra,
    },
});

const listOf = (names: string[]) => ({
    data: {
        items: names.map((name, i) => ({
            id: `k${i}`, name, prefix: 'bcms_ro', scopes: ['content:read'], tenantSlug: 'acme', revoked: false, createdAt: '2026-11-18T10:00:00Z',
        })),
        page: 1, pageSize: 20, totalItems: names.length, totalPages: 1, hasNextPage: false,
    },
});

function mount(modules: unknown = { kind: 'modules', modules: [{ name: 'ApiKeyPairing', enabled: true }] }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // The module list is read once and kept, so it is seeded the way a read would leave it.
    if (modules) client.setQueryData(MODULES_KEY, modules);
    render(React.createElement(QueryClientProvider, { client }, React.createElement(ConnectPhone)));
    return { client };
}

const keyReads = () => vi.mocked(api.get).mock.calls.filter((c) => c[0] === '/api/api-keys').length;
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

async function openDialog() {
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Connect a phone' }));
    });
    await flush();
}

describe('Connect a phone', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
        access.can.mockReturnValue(true);
        vi.mocked(api.post).mockReset();
        vi.mocked(api.get).mockReset();
        toDataURL.mockClear();
        vi.mocked(api.post).mockResolvedValue(started());
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/api-keys') return listOf(['CI deploy']);
            throw new Error(`unexpected GET ${url}`);
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

    it('hides the button when the module is not listed or not enabled', () => {
        mount({ kind: 'modules', modules: [{ name: 'Other', enabled: true }, { name: 'ApiKeyPairing', enabled: false }] });
        expect(screen.queryByRole('button', { name: 'Connect a phone' })).toBeNull();
    });

    it('hides the button when the module list cannot be read', () => {
        mount({ kind: 'unreadable' });
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
        await flush();
        expect(api.post).toHaveBeenCalledTimes(1);
    });

    it('sends a name with the local time and draws the server link as the QR, without showing the code', async () => {
        mount();
        await openDialog();
        const [url, body] = vi.mocked(api.post).mock.calls[0] as [string, { name: string }];
        expect(url).toBe('/api/api-keys/pairings');
        expect(body.name).toMatch(/^Phone \d\d:\d\d:\d\d$/);
        expect(toDataURL).toHaveBeenCalledWith(LINK);
        expect(screen.getByAltText('QR code to connect a phone')).toBeInTheDocument();
        expect(document.body.textContent).not.toContain('SERVERCODE12');
        expect(screen.getByTestId('pairing-countdown')).toHaveTextContent('2:00');
    });

    it('shows the warning as text under the QR', async () => {
        vi.mocked(api.post).mockResolvedValue(started({ warning: 'This instance is reachable only on your network.' }));
        mount();
        await openDialog();
        expect(screen.getByText('This instance is reachable only on your network.')).toBeInTheDocument();
    });

    it('shows the https message and no QR when the instance url is http and not local', async () => {
        vi.mocked(api.post).mockResolvedValue(started({ instanceUrl: 'http://cms.example.com' }));
        mount();
        await openDialog();
        expect(screen.getByText('A phone can only connect over https. This address is not https.')).toBeInTheDocument();
        expect(screen.queryByAltText('QR code to connect a phone')).toBeNull();
        expect(toDataURL).not.toHaveBeenCalled();
    });

    it('says to wait on a 429', async () => {
        vi.mocked(api.post).mockRejectedValue(
            Object.assign(new Error('429'), { isAxiosError: true, response: { status: 429, data: '', headers: {} } }),
        );
        mount();
        await openDialog();
        expect(screen.getAllByText('Too many codes. Wait a minute and try again.').length).toBeGreaterThan(0);
        expect(screen.queryByAltText('QR code to connect a phone')).toBeNull();
    });

    it('shows the expired state and stops reading the list when the code runs out', async () => {
        vi.mocked(api.post).mockResolvedValue(started({}, 10_000));
        mount();
        await openDialog();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(11_000);
        });
        expect(screen.getByText('Code expired')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New code' })).toBeInTheDocument();
        const reads = keyReads();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(keyReads()).toBe(reads);
    });

    it('asks for a new code from the expired state', async () => {
        vi.mocked(api.post).mockResolvedValueOnce(started({}, 5_000));
        mount();
        await openDialog();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(6_000);
        });
        vi.mocked(api.post).mockResolvedValueOnce(started({ id: 'p2', link: 'togo://connect?v=2&code=NEW' }, 126_000));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'New code' }));
        });
        await flush();
        expect(api.post).toHaveBeenCalledTimes(2);
        expect(toDataURL).toHaveBeenLastCalledWith('togo://connect?v=2&code=NEW');
        expect(screen.getByAltText('QR code to connect a phone')).toBeInTheDocument();
    });

    it('reads the key list every three seconds and shows connected when the named row appears', async () => {
        mount();
        await openDialog();
        const name = (vi.mocked(api.post).mock.calls[0][1] as { name: string }).name;
        const before = keyReads();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3_000);
        });
        expect(keyReads()).toBe(before + 1);
        expect(screen.getByAltText('QR code to connect a phone')).toBeInTheDocument();

        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/api-keys') return listOf(['CI deploy', name]);
            throw new Error(`unexpected GET ${url}`);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3_000);
        });
        expect(screen.getByText('Phone connected')).toBeInTheDocument();
        expect(screen.queryByAltText('QR code to connect a phone')).toBeNull();
        const reads = keyReads();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(12_000);
        });
        expect(keyReads()).toBe(reads);
    });

    it('stops reading the list after the dialog closes', async () => {
        mount();
        await openDialog();
        await act(async () => {
            // The footer button, not the dialog's x, which has the same name.
            fireEvent.click(screen.getByText('Close', { selector: 'button' }));
        });
        await flush();
        const reads = keyReads();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(12_000);
        });
        expect(keyReads()).toBe(reads);
    });
});
