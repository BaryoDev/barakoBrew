import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ShareLinkScope } from '@/lib/share-links';

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
const { ShareLinksPanel } = await import('./share-links-panel');
const { siteShareScope } = await import('@/lib/site-mode');

function httpError(status: number) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data: {},
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

function renderPanel(siteUrl: unknown = 'https://example.com') {
    return renderScope(siteShareScope(siteUrl));
}

function renderScope(scope: ShareLinkScope) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <ShareLinksPanel scope={scope} />
        </QueryClientProvider>,
    );
}

function expiryOptions() {
    return Array.from(screen.getByLabelText('Expires after').querySelectorAll('option')).map((o) => o.textContent);
}

/** The days between now and the `expiresAt` of the one create call made. */
function postedDays() {
    expect(api.post).toHaveBeenCalledTimes(1);
    const [, body] = vi.mocked(api.post).mock.calls[0] as [string, { expiresAt: string }];
    return (new Date(body.expiresAt).getTime() - Date.now()) / DAY;
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
});

describe('ShareLinksPanel', () => {
    it('is hidden when the share links endpoint answers 404', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(404));

        const { container } = renderPanel();

        // The heading shows while the list loads, so its absence afterwards is the 404 hiding it.
        expect(screen.getByRole('heading', { name: 'Share links' })).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole('heading', { name: 'Share links' })).toBeNull());
        expect(container).toBeEmptyDOMElement();
        expect(api.get).toHaveBeenCalledWith('/api/site/share-links');
    });

    it('stays visible with a retry when the list fails another way', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(500));

        renderPanel();

        expect(await screen.findByText('The share links could not be loaded.')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Share links' })).toBeInTheDocument();
    });

    it('shows the full link once, and not after Done or a reload of the list', async () => {
        const stored = { id: 'l1', label: 'Launch preview', createdAt: inDays(0), createdBy: 'admin', expiresAt: inDays(30), revokedAt: null, lastUsedAt: null };
        let list: unknown[] = [];
        vi.mocked(api.get).mockImplementation(async () => ({ data: list }));
        vi.mocked(api.post).mockImplementation(async () => {
            list = [stored];
            return { data: { id: 'l1', label: 'Launch preview', createdAt: stored.createdAt, expiresAt: stored.expiresAt, key: 'sEcReT-key-42' } };
        });

        renderPanel('https://club.example.org/');
        expect(await screen.findByText('No share links yet.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Label'), { target: { value: '  Launch preview ' } });
        fireEvent.change(screen.getByLabelText('Expires after'), { target: { value: '7' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

        const link = await screen.findByRole('textbox', { name: 'Share link' });
        expect(link).toHaveValue('https://club.example.org/_share#sEcReT-key-42');
        expect(screen.getByText(/cannot be shown again/)).toBeInTheDocument();

        expect(api.post).toHaveBeenCalledTimes(1);
        const [url, body] = vi.mocked(api.post).mock.calls[0] as [string, { label: string; expiresAt: string }];
        expect(url).toBe('/api/site/share-links');
        expect(body.label).toBe('Launch preview');
        const days = (new Date(body.expiresAt).getTime() - Date.now()) / DAY;
        expect(days).toBeGreaterThan(6.9);
        expect(days).toBeLessThan(7.1);

        // The list reloads with the new row, and the key is still only in the one-time box.
        const row = (await screen.findByText('Launch preview', { selector: 'td' })).closest('tr')!;
        expect(within(row).getByText('Active')).toBeInTheDocument();
        expect(within(row).queryByText(/sEcReT/)).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(screen.queryByRole('textbox', { name: 'Share link' })).toBeNull();
        expect(document.body.textContent).not.toContain('sEcReT-key-42');
        expect(screen.queryByDisplayValue(/sEcReT-key-42/)).toBeNull();
        expect(screen.getByText('Launch preview', { selector: 'td' })).toBeInTheDocument();
    });

    it('without a saved site address, shows the path to add after it', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: [] });
        vi.mocked(api.post).mockResolvedValue({ data: { id: 'l2', label: 'x', createdAt: inDays(0), expiresAt: inDays(30), key: 'k9' } });

        renderPanel('');
        await screen.findByText('No share links yet.');
        fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'x' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

        expect(await screen.findByRole('textbox', { name: 'Share link' })).toHaveValue('/_share#k9');
        expect(screen.getByText(/no saved address/)).toBeInTheDocument();
    });

    it('lists each status, and revokes an active link only after confirming', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: [
                { id: 'act', label: 'Active one', createdAt: inDays(-1), expiresAt: inDays(10), revokedAt: null, lastUsedAt: inDays(-1) },
                { id: 'exp', label: 'Expired one', createdAt: inDays(-40), expiresAt: inDays(-10), revokedAt: null, lastUsedAt: null },
                { id: 'rev', label: 'Revoked one', createdAt: inDays(-5), expiresAt: inDays(25), revokedAt: inDays(-2), lastUsedAt: null },
            ],
        });
        vi.mocked(api.delete).mockResolvedValue({ status: 204 });

        renderPanel();

        const rows = (await screen.findAllByRole('row')).slice(1);
        expect(rows).toHaveLength(3);
        expect(rows.map((r) => within(r).getAllByRole('cell')[1].textContent)).toEqual(['Active', 'Expired', 'Revoked']);
        expect(within(rows[0]).queryByText('Never')).toBeNull();
        expect(within(rows[1]).getByText('Never')).toBeInTheDocument();

        expect(screen.getByRole('button', { name: 'Revoke Active one' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Revoke Expired one' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Revoke Revoked one' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Revoke Active one' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(api.delete).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/site/share-links/act'));
    });
});

describe('the expiry maximum', () => {
    it('is the 90 days barakoCMS enforces when the response reports none', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: [] });
        vi.mocked(api.post).mockResolvedValue({ data: { id: 'l1', label: 'x', createdAt: inDays(0), expiresAt: inDays(30), key: 'k' } });

        renderPanel();
        await screen.findByText('No share links yet.');

        expect(expiryOptions()).toEqual(['1 day', '7 days', '30 days', '90 days']);
        expect(screen.getByLabelText('Expires after')).toHaveValue('30');
    });

    it('is what the API reports instead, shorter than 90', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [], maxExpiryDays: 14 } });
        vi.mocked(api.post).mockResolvedValue({ data: { id: 'l1', label: 'x', createdAt: inDays(0), expiresAt: inDays(14), key: 'k' } });

        renderPanel();
        await screen.findByText('No share links yet.');

        expect(expiryOptions()).toEqual(['1 day', '7 days', '14 days']);
        expect(screen.getByLabelText('Expires after')).toHaveValue('14');

        fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Client preview' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

        await screen.findByRole('textbox', { name: 'Share link' });
        const days = postedDays();
        expect(days).toBeGreaterThan(13.9);
        expect(days).toBeLessThan(14.1);
    });

    it('is what the API reports instead, longer than 90', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [], maxExpiryDays: 365 } });
        vi.mocked(api.post).mockResolvedValue({ data: { id: 'l1', label: 'x', createdAt: inDays(0), expiresAt: inDays(365), key: 'k' } });

        renderPanel();
        await screen.findByText('No share links yet.');

        expect(expiryOptions()).toEqual(['1 day', '7 days', '30 days', '90 days', '180 days', '365 days']);

        fireEvent.change(screen.getByLabelText('Expires after'), { target: { value: '365' } });
        fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Long preview' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

        await screen.findByRole('textbox', { name: 'Share link' });
        const days = postedDays();
        expect(days).toBeGreaterThan(364.9);
        expect(days).toBeLessThan(365.1);
    });
});

describe('a scope other than the site', () => {
    /** What barakoCMS#857 will add. Nothing but this object changes to get the panel there. */
    const entryScope: ShareLinkScope = {
        key: ['entry', 'e-7'],
        path: '/api/entries/e-7/share-links',
        description: 'Let someone see this draft entry.',
        revokeWarning: 'Anyone opening this link stops seeing the draft.',
        link: (key) => ({ value: `https://example.com/_preview#${key}`, complete: true }),
        incompleteNote: 'no address',
    };

    it('lists, creates and revokes at its own path, in its own words', async () => {
        const stored = { id: 'e1', label: 'Draft for review', createdAt: inDays(0), expiresAt: inDays(7), revokedAt: null, lastUsedAt: null };
        let list: unknown[] = [];
        vi.mocked(api.get).mockImplementation(async () => ({ data: list }));
        vi.mocked(api.post).mockImplementation(async () => {
            list = [stored];
            return { data: { ...stored, key: 'entry-KEY' } };
        });
        vi.mocked(api.delete).mockResolvedValue({ status: 204 });

        renderScope(entryScope);
        await screen.findByText('No share links yet.');
        expect(api.get).toHaveBeenCalledWith('/api/entries/e-7/share-links');
        expect(screen.getByText('Let someone see this draft entry.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Draft for review' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

        expect(await screen.findByRole('textbox', { name: 'Share link' })).toHaveValue(
            'https://example.com/_preview#entry-KEY',
        );
        expect(api.post).toHaveBeenCalledWith('/api/entries/e-7/share-links', expect.objectContaining({ label: 'Draft for review' }));

        const rows = (await screen.findAllByRole('row')).slice(1);
        expect(rows).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Revoke Draft for review' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(within(dialog).getByText('Anyone opening this link stops seeing the draft.')).toBeInTheDocument();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/entries/e-7/share-links/e1'));
    });
});
