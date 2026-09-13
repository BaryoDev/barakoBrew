import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentStatus } from '@/types/content';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return {
        ...actual,
        api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
    };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const replace = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: { id: 'u1', username: 'a', roles: ['Admin'] } }),
}));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { default: SingletonEntryPage } = await import('./page');

const OLDEST = '0b7c1f0e-6d7a-4f3e-9a51-0d1c2b3a4f50';
const NEWER = '9e8d7c6b-5a49-4382-a716-f5e4d3c2b1a0';

const SITE = {
    name: 'sitesettings',
    displayName: 'Site settings',
    isSingleton: true,
    fields: [{ name: 'Phone', displayName: 'Phone', type: 'string', isRequired: false }],
};

const ARTICLE = { ...SITE, name: 'article', displayName: 'Article', isSingleton: false };

function entry(id: string, phone: string) {
    return {
        id,
        contentType: 'sitesettings',
        data: { Phone: phone },
        status: ContentStatus.Published,
        sensitivity: 'Public',
        version: 1,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
    };
}

const page = (items: unknown[]) => ({ items, totalItems: items.length, page: 1, pageSize: 2 });

/** Answers the way the API does. `stored` is what GET /api/contents?contentType= would return. */
function serve(stored: () => ReturnType<typeof entry>[]) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types') return { data: page([SITE, ARTICLE]) };
        if (url === '/api/contents') return { data: page(stored()) };
        if (url.endsWith('/history')) return { data: page([]) };
        const hit = stored().find((e) => url === `/api/contents/${e.id}`);
        if (hit) return { data: hit, headers: {} };
        throw new Error(`unrouted GET ${url}`);
    });
}

function renderPage(type = 'sitesettings') {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const params = Object.assign(Promise.resolve({ type }), {
        status: 'fulfilled' as const,
        value: { type },
    });
    return render(
        <QueryClientProvider client={client}>
            <React.Suspense fallback={null}>
                <SingletonEntryPage params={params} />
            </React.Suspense>
        </QueryClientProvider>
    );
}

describe('a single-entry type', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('with no entry yet, creates it on the first save and then edits it', async () => {
        let stored: ReturnType<typeof entry>[] = [];
        serve(() => stored);
        vi.mocked(api.post).mockImplementation(async () => {
            stored = [entry(OLDEST, '+63 2 8123 4567')];
            return { data: { id: OLDEST, version: 1 } };
        });

        renderPage();

        expect(await screen.findByRole('heading', { name: 'Site settings' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();

        fireEvent.change(screen.getByLabelText(/Phone/), { target: { value: '+63 2 8123 4567' } });
        fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const [url, body] = vi.mocked(api.post).mock.calls[0];
        expect(url).toBe('/api/contents');
        expect(body).toEqual({
            contentType: 'sitesettings',
            data: { Phone: '+63 2 8123 4567' },
            status: ContentStatus.Published,
        });

        // The screen turns into the editor for the entry it just created, rather than staying a
        // create form that the API would refuse the second time.
        expect(await screen.findByRole('button', { name: /save changes/i })).toBeTruthy();
        expect(await screen.findByDisplayValue('+63 2 8123 4567')).toBeTruthy();
        expect(api.put).not.toHaveBeenCalled();
    });

    it('with an entry, edits that entry and never creates another', async () => {
        serve(() => [entry(OLDEST, 'before')]);
        vi.mocked(api.put).mockResolvedValue({ data: { id: OLDEST, version: 2 }, headers: {} });

        renderPage();

        const field = await screen.findByDisplayValue('before');
        expect(screen.getByRole('heading', { name: 'Site settings' })).toBeTruthy();
        // No list of this type exists to go back to.
        expect(screen.queryByRole('button', { name: /back to entries/i })).toBeNull();

        fireEvent.change(field, { target: { value: 'after' } });
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0][0]).toBe(`/api/contents/${OLDEST}`);
        expect(api.post).not.toHaveBeenCalled();
    });

    it('asks for the entry by type, oldest first', async () => {
        serve(() => [entry(OLDEST, 'before')]);

        renderPage();
        await screen.findByDisplayValue('before');

        const listCalls = vi.mocked(api.get).mock.calls.filter(([url]) => url === '/api/contents');
        expect(listCalls.length).toBeGreaterThan(0);
        expect(listCalls[0][1]).toEqual({
            params: { contentType: 'sitesettings', page: 1, pageSize: 2, sortOrder: 'asc' },
        });
    });

    it('holding more than one entry, edits the oldest and says how many there are', async () => {
        serve(() => [entry(OLDEST, 'oldest'), entry(NEWER, 'newer')]);

        renderPage();

        expect(await screen.findByDisplayValue('oldest')).toBeTruthy();
        expect(screen.queryByDisplayValue('newer')).toBeNull();
        expect(screen.getByText(/2 are stored/)).toBeTruthy();
    });

    it('sends a type without the flag to its list', async () => {
        serve(() => []);

        renderPage('article');

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/content?type=article'));
        expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    });
});
