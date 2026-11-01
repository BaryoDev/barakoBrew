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
const { apiKeyKind } = await import('@/hooks/use-api-keys');
const { default: ApiKeysPage } = await import('./page');

const SECRET = 'bcms_BRANDNEWSECRET987654';

const OLD = {
    id: 'old',
    name: 'CI deploy',
    prefix: 'bcms_ab12cd34',
    scopes: ['content:read', '*'],
    tenantSlug: 'default',
    expiresAt: null,
    lastUsedAt: null,
    revoked: false,
    createdAt: '2026-10-01T00:00:00Z',
    contentTypes: ['changelog'],
};
const NEW = { ...OLD, id: 'new', prefix: 'bcms_ef56gh78', createdAt: '2026-11-01T00:00:00Z', key: SECRET };

const envelope = (items: unknown[]) => ({
    data: { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: 1, hasNextPage: false },
});

let listed: unknown[];
let client: QueryClient;

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
    listed = [OLD];
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/api-keys') return envelope(listed);
        if (url === '/api/meta') return { data: { version: '5.1.0', swaggerEnabled: false } };
        throw new Error(`unexpected GET ${url}`);
    });
    vi.mocked(api.post).mockImplementation(async () => {
        const { key, ...rest } = NEW;
        void key;
        // The API shortens the old key's expiry and lists both keys from then on.
        listed = [{ ...OLD, expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() }, rest];
        return { data: NEW };
    });
    vi.mocked(api.delete).mockResolvedValue({});
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

async function openRail() {
    render(React.createElement(QueryClientProvider, { client }, React.createElement(ApiKeysPage)));
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate CI deploy' }));
    return screen.findByRole('dialog');
}

async function rotate() {
    await openRail();
    fireEvent.click(screen.getByRole('button', { name: 'Rotate key' }));
    await waitFor(() => expect(screen.getByTestId('rotated-key-secret')).toHaveValue(SECRET));
}

function heldInCaches() {
    const holds = (value: unknown) => JSON.stringify(value ?? null).includes(SECRET);
    return (
        client.getMutationCache().getAll().some((m) => holds(m.state.data)) ||
        client.getQueryCache().getAll().some((q) => holds(q.state.data))
    );
}

describe('rotating an API key', () => {
    it('lists each key with its kind, mono scope chips and last used', async () => {
        render(React.createElement(QueryClientProvider, { client }, React.createElement(ApiKeysPage)));
        await screen.findByText('CI deploy');
        const row = screen.getAllByRole('row')[1];
        expect(screen.getByRole('columnheader', { name: 'Kind' })).toBeInTheDocument();
        expect(row).toHaveTextContent('Standard');
        expect(within(row).getByText('content:read')).toHaveClass('font-mono');
        expect(screen.getByRole('columnheader', { name: 'Last used' })).toBeInTheDocument();
    });

    it('shows a prefix it does not know as the raw prefix', () => {
        expect(apiKeyKind('bcms_ab12cd34')).toBe('Standard');
        expect(apiKeyKind('bcms_ro_ab12cd34')).toBe('Read-only');
        expect(apiKeyKind('zzz_ab12cd34')).toBe('zzz_');
    });

    it('opens a rail with the 60 minute default, what stays the same and the files scope note', async () => {
        const rail = await openRail();
        const slider = within(rail).getByRole('slider');
        expect(slider).toHaveAttribute('min', '0');
        expect(slider).toHaveAttribute('max', '6');
        expect(slider).toHaveAttribute('aria-valuetext', '60 minutes');
        expect(rail).toHaveTextContent('What stays the same');
        expect(rail).toHaveTextContent('does not include files:read or files:write');
        expect(api.post).not.toHaveBeenCalled();
    });

    it('rotates with a 60 minute overlap, reveals the new key once and lists the old one as overlapping', async () => {
        await rotate();

        expect(api.post).toHaveBeenCalledTimes(1);
        expect(api.post).toHaveBeenCalledWith('/api/api-keys/old/rotate', { overlapMinutes: 60 });
        expect(screen.getByText(/the old key stops working at/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Stop the old key now' })).toBeInTheDocument();
        expect(heldInCaches()).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        await waitFor(() => expect(screen.queryByTestId('rotated-key-secret')).toBeNull());

        const rows = await waitFor(() => {
            const all = screen.getAllByRole('row');
            expect(all).toHaveLength(3);
            return all;
        });
        expect(rows[1]).toHaveTextContent('CI deploy');
        expect(rows[1]).toHaveTextContent('Overlap - stops in 60 min');
        expect(rows[2]).toHaveTextContent('Active');
    });

    it('sends the chosen overlap', async () => {
        const rail = await openRail();
        fireEvent.change(within(rail).getByRole('slider'), { target: { value: '0' } });
        expect(within(rail).getByRole('slider')).toHaveAttribute('aria-valuetext', 'None');
        fireEvent.change(within(rail).getByRole('slider'), { target: { value: '6' } });
        fireEvent.click(screen.getByRole('button', { name: 'Rotate key' }));
        await waitFor(() => expect(api.post).toHaveBeenCalled());
        expect(api.post).toHaveBeenCalledWith('/api/api-keys/old/rotate', { overlapMinutes: 7 * 24 * 60 });
    });

    it('leaves the new key out of the DOM, the caches and storage once the rail closes', async () => {
        await rotate();

        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        await waitFor(() => expect(screen.queryByTestId('rotated-key-secret')).toBeNull());

        expect(document.body.textContent).not.toContain(SECRET);
        expect(heldInCaches()).toBe(false);
        expect(JSON.stringify({ ...localStorage })).not.toContain(SECRET);
        expect(JSON.stringify({ ...sessionStorage })).not.toContain(SECRET);
    });

    it('stops the old key now by revoking it', async () => {
        await rotate();

        fireEvent.click(screen.getByRole('button', { name: 'Stop the old key now' }));

        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/api-keys/old'));
        expect(await screen.findByText('The old key has stopped.')).toBeInTheDocument();
    });
});
