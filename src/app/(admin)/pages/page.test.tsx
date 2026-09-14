import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import type { PageTreeItem } from '@/types/pages';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), put: vi.fn(), post: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix sizes its switches and dialogs with one, and jsdom ships no implementation.
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { default: PagesPage } = await import('./page');

function httpError(status: number, data: unknown = {}) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

function item(id: string, title: string, path: string, order: number | null, children: PageTreeItem[] = []): PageTreeItem {
    return { id, title, slug: title.toLowerCase(), path, status: 'Published', showInNavigation: true, order, children };
}

/** About (with Team under it), then Contact. */
const TREE = {
    contract: 1,
    truncated: false,
    items: [item('about', 'About', '/about', 1, [item('team', 'Team', '/about/team', 1)]), item('contact', 'Contact', '/contact', 2)],
};

const CONTACT_ENTRY = {
    id: 'contact',
    contentType: 'page',
    data: { Title: 'Contact', Slug: 'contact', NavigationOrder: 2 },
    status: 'Published',
    version: 4,
};

let treeResponse: () => Promise<unknown>;
let entryParent: string | undefined;

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(api.post).mockReset();
    treeResponse = async () => ({ data: TREE });
    entryParent = undefined;

    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/pages/tree') return treeResponse();
        if (url === '/api/content-types') {
            return { data: { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } };
        }
        if (url === '/api/contents/contact') {
            const data = entryParent ? { ...CONTACT_ENTRY.data, ParentPage: entryParent } : CONTACT_ENTRY.data;
            return { data: { ...CONTACT_ENTRY, data }, headers: { etag: '"v4"' } };
        }
        throw httpError(404);
    });
});

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <PagesPage />
        </QueryClientProvider>,
    );
}

const rowOf = (name: string) => screen.getByRole('link', { name }).closest('[data-page-id]') as HTMLElement;

describe('Pages screen', () => {
    it('says the module is not enabled on a 404, rather than that loading failed', async () => {
        treeResponse = async () => {
            throw httpError(404);
        };

        renderPage();

        expect(await screen.findByText('The Pages module is not enabled')).toBeInTheDocument();
        expect(screen.queryByText(/Couldn.t load pages/)).not.toBeInTheDocument();
        expect(screen.queryByRole('list', { name: 'Page tree' })).not.toBeInTheDocument();
    });

    it('shows the error state for a failure that is not a 404', async () => {
        treeResponse = async () => {
            throw httpError(500);
        };

        renderPage();

        expect(await screen.findByText(/Couldn.t load pages/)).toBeInTheDocument();
        expect(screen.queryByText('The Pages module is not enabled')).not.toBeInTheDocument();
    });

    it('lists the pages flat with moving off when the contract is one it does not read', async () => {
        treeResponse = async () => ({ data: { ...TREE, contract: 2 } });

        renderPage();

        expect(await screen.findByText(/sends page tree contract 2/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Team' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Contact' })).toBeInTheDocument();
        expect(screen.queryAllByRole('button', { name: /^Move / })).toHaveLength(0);
    });

    it('renders the tree with nesting, status and the truncated notice', async () => {
        treeResponse = async () => ({ data: { ...TREE, truncated: true } });

        renderPage();

        const tree = await screen.findByRole('list', { name: 'Page tree' });
        expect(within(tree).getAllByRole('link', { name: /^(About|Team|Contact)$/ })).toHaveLength(3);
        expect(screen.getByText(/Not every page is shown/)).toBeInTheDocument();
        expect(within(rowOf('Team')).getByText('/about/team')).toBeInTheDocument();
        expect(within(rowOf('Team')).getByText('Published')).toBeInTheDocument();
        expect(within(rowOf('About')).getByRole('link', { name: 'Add a page under About' })).toHaveAttribute(
            'href',
            '/content/new?type=page&parent=about',
        );
    });

    it('writes the parent and order through the content update with If-Match, then offers a redirect', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { id: 'contact', version: 5 } });
        vi.mocked(api.post).mockResolvedValue({ data: {} });

        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Move Contact into the page above' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(api.put).toHaveBeenCalledWith(
            '/api/contents/contact',
            {
                id: 'contact',
                data: { Title: 'Contact', Slug: 'contact', NavigationOrder: 2, ParentPage: 'about' },
                status: 'Published',
                version: 4,
            },
            { headers: { 'If-Match': '"v4"' } },
        );

        const offer = await screen.findByRole('region', { name: 'A page address changed' });
        expect(within(offer).getByText('/contact')).toBeInTheDocument();
        expect(within(offer).getByText('/about/contact')).toBeInTheDocument();

        fireEvent.click(within(offer).getByRole('button', { name: 'Add redirect' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        expect(api.post).toHaveBeenCalledWith('/api/redirects', {
            fromPath: '/contact',
            toPath: '/about/contact',
            permanent: false,
            note: 'Page moved in the console',
        });
        expect(await within(offer).findByText('Added')).toBeInTheDocument();
    });

    it('offers no redirect for a reorder, which changes no address', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: {} });
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/pages/tree') return { data: TREE };
            if (url === '/api/content-types') return { data: { items: [] } };
            const id = url.split('/').pop();
            return { data: { id, data: { Title: id }, status: 'Published', version: 1 }, headers: {} };
        });

        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Move Contact up' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
        expect(vi.mocked(api.put).mock.calls.map((c) => [c[0], (c[1] as { data: Record<string, unknown> }).data.NavigationOrder])).toEqual([
            ['/api/contents/contact', 1],
            ['/api/contents/about', 2],
        ]);
        // No ETag came back, so none is sent rather than an empty one.
        expect(vi.mocked(api.put).mock.calls[0][2]).toBeUndefined();
        expect(screen.queryByRole('region', { name: /address/ })).not.toBeInTheDocument();
    });

    it("shows the API's refusal on the page it refused", async () => {
        vi.mocked(api.put).mockRejectedValue(
            httpError(400, { status: 400, errors: [{ name: 'generalErrors', reason: 'A page may not have more than 8 ancestors.' }] }),
        );

        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Move Contact into the page above' }));

        const alert = await within(rowOf('Contact')).findByRole('alert');
        expect(alert).toHaveTextContent('A page may not have more than 8 ancestors.');
        expect(screen.queryByRole('region', { name: /address/ })).not.toBeInTheDocument();
    });

    it('reloads the tree and says someone else changed the page on a 412', async () => {
        vi.mocked(api.put).mockRejectedValue(httpError(412));

        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Move Contact into the page above' }));

        const alert = await within(rowOf('Contact')).findByRole('alert');
        expect(alert).toHaveTextContent('Someone else changed this page. It has been reloaded.');
        const treeReads = () => vi.mocked(api.get).mock.calls.filter((c) => c[0] === '/api/pages/tree').length;
        await waitFor(() => expect(treeReads()).toBe(2));
    });

    it('does not save over a move someone else made after the tree was read', async () => {
        entryParent = 'team';

        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Move Contact into the page above' }));

        const alert = await within(rowOf('Contact')).findByRole('alert');
        expect(alert).toHaveTextContent('Someone else changed this page.');
        expect(api.put).not.toHaveBeenCalled();
    });

    it('saves the navigation switch through the same update', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: {} });

        renderPage();
        const row = rowOf(await screen.findByRole('link', { name: 'Contact' }).then((l) => l.textContent ?? ''));
        fireEvent.click(within(row).getByRole('switch'));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        const body = vi.mocked(api.put).mock.calls[0][1] as { data: Record<string, unknown> };
        expect(body.data.ShowInNavigation).toBe(false);
        expect(body.data).not.toHaveProperty('ParentPage');
    });
});
