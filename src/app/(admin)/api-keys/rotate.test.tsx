import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { toast } = await import('sonner');
const { default: ApiKeysPage } = await import('./page');

const SECRET = 'bcms_NEWKEYSECRET99';
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

const base = { tenantSlug: 'default', lastUsedAt: null, revoked: false, createdAt: '2026-09-01T00:00:00Z', contentTypes: [] as string[] };
const ACTIVE = { ...base, id: 'k1', name: 'CI deploy', prefix: 'bcms_old1', scopes: ['*', 'content:read'], expiresAt: null };

function serve(items: unknown[]) {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/api-keys') return { data: { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: 1, hasNextPage: false } };
        return { data: {} };
    });
}

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(React.createElement(QueryClientProvider, { client }, React.createElement(ApiKeysPage)));
    return client;
}

async function openRail() {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate CI deploy' }));
    return screen.findByRole('dialog');
}

beforeEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
    vi.mocked(toast.success).mockReset();
    serve([ACTIVE]);
});

describe('the key list', () => {
    it('draws scopes as mono chips', async () => {
        renderPage();
        const chip = await screen.findByText('content:read');
        expect(chip.className).toContain('font-mono');
    });

    it('shows Overlap with the time left when the key has been replaced', async () => {
        serve([{ ...ACTIVE, replacedBy: 'k2', expiresAt: inMinutes(60) }]);
        renderPage();
        expect(await screen.findByText('Overlap')).toBeInTheDocument();
        expect(screen.getByText(/stops in (59|60) min/)).toBeInTheDocument();
    });

    it('shows an ordinary expiry as Active while it is in the future, with no marker', async () => {
        serve([{ ...ACTIVE, expiresAt: inMinutes(600) }]);
        renderPage();
        expect(await screen.findByText('Active')).toBeInTheDocument();
        expect(screen.queryByText('Overlap')).toBeNull();
    });

    it('shows Expired for a key past its expiry, and offers no Rotate', async () => {
        serve([{ ...ACTIVE, expiresAt: '2026-01-01T00:00:00Z' }]);
        renderPage();
        expect(await screen.findByText('Expired')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Rotate/ })).toBeNull();
    });
});

describe('the rotate rail', () => {
    it('opens at 440px with the overlap at 60 minutes and says what stays the same', async () => {
        const rail = await openRail();
        expect(rail.className).toContain('sm:max-w-[440px]');
        expect(within(rail).getByText('Rotate this key')).toBeInTheDocument();
        expect(within(rail).getByTestId('overlap-label')).toHaveTextContent('60 min');
        const slider = within(rail).getByRole('slider', { name: 'Overlap window' });
        expect(slider).toHaveAttribute('min', '0');
        expect(slider).toHaveAttribute('max', '6');
        expect(within(rail).getByText('What stays the same')).toBeInTheDocument();
        expect(within(rail).getByText(/does not include/)).toBeInTheDocument();
    });

    it('leaves out the files note for a key without the * scope', async () => {
        serve([{ ...ACTIVE, scopes: ['content:read'] }]);
        const rail = await openRail();
        expect(within(rail).queryByText(/does not include/)).toBeNull();
    });

    it('moves through the seven stops and posts the minutes of the one chosen', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { ...ACTIVE, id: 'k2', prefix: 'bcms_new2', key: SECRET } });
        const rail = await openRail();
        const slider = within(rail).getByRole('slider', { name: 'Overlap window' });
        const seen: string[] = [];
        for (let i = 0; i <= 6; i++) {
            fireEvent.change(slider, { target: { value: String(i) } });
            seen.push(within(rail).getByTestId('overlap-label').textContent ?? '');
        }
        expect(seen).toEqual(['none', '15 min', '60 min', '4 h', '24 h', '3 days', '7 days']);
        fireEvent.change(slider, { target: { value: '3' } });
        fireEvent.click(within(rail).getByRole('button', { name: 'Issue new key' }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/api-keys/k1/rotate', { overlapMinutes: 240 }));
    });

    it('posts 60 minutes when the slider is left alone', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { ...ACTIVE, id: 'k2', key: SECRET } });
        const rail = await openRail();
        fireEvent.click(within(rail).getByRole('button', { name: 'Issue new key' }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/api-keys/k1/rotate', { overlapMinutes: 60 }));
    });

    it('shows the new key once through RevealOnce, keeps it out of the caches, and says when the old one stops', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { ...ACTIVE, id: 'k2', prefix: 'bcms_new2', key: SECRET } });
        const client = renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Rotate CI deploy' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Issue new key' }));
        const field = await screen.findByTestId('rotated-key-secret');
        expect(field).toHaveValue(SECRET);
        expect(screen.getByText('New key issued')).toBeInTheDocument();
        expect(screen.getByTestId('old-stops')).toHaveTextContent(/in (59|60) min/);
        const holds = (v: unknown) => JSON.stringify(v ?? null).includes(SECRET);
        expect(client.getMutationCache().getAll().some((m) => holds(m.state.data))).toBe(false);
        expect(client.getQueryCache().getAll().some((q) => holds(q.state.data))).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: 'I have copied it' }));
        await waitFor(() => expect(screen.queryByTestId('rotated-key-secret')).toBeNull());
    });

    it('says already stopped for an overlap of none', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { ...ACTIVE, id: 'k2', key: SECRET } });
        const rail = await openRail();
        fireEvent.change(within(rail).getByRole('slider', { name: 'Overlap window' }), { target: { value: '0' } });
        fireEvent.click(within(rail).getByRole('button', { name: 'Issue new key' }));
        await waitFor(() => expect(screen.getByTestId('old-stops')).toHaveTextContent('already stopped'));
    });

    it('stops the old key now with DELETE', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { ...ACTIVE, id: 'k2', key: SECRET } });
        vi.mocked(api.delete).mockResolvedValue({ data: undefined });
        const rail = await openRail();
        fireEvent.click(within(rail).getByRole('button', { name: 'Issue new key' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Stop the old key now' }));
        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/api-keys/k1'));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Old key stopped. Anything still using it gets 401 now.'));
    });

    it('says why when core refuses: 403 and 409', async () => {
        const refuse = (status: number) => Object.assign(new Error(`status ${status}`), { isAxiosError: true, response: { status, data: {} } });
        vi.mocked(api.post).mockRejectedValueOnce(refuse(403));
        const rail = await openRail();
        fireEvent.click(within(rail).getByRole('button', { name: 'Issue new key' }));
        expect(await within(rail).findByRole('alert')).toHaveTextContent('Only the key’s owner or a SuperAdmin can rotate it.');

        vi.mocked(api.post).mockRejectedValueOnce(refuse(409));
        fireEvent.click(within(rail).getByRole('button', { name: 'Issue new key' }));
        await waitFor(() => expect(within(rail).getByRole('alert')).toHaveTextContent('changed while you were rotating'));
    });
});
