import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentStatus } from '@/types/content';

/**
 * Two editors, one entry.
 *
 * The API refuses a stale save: the editor echoes `version` on every write and the server answers
 * 412 when the entry has moved on. That was proven by hand against a real API and nothing covered
 * it, so the first case here pins it.
 *
 * The other two are the part the console was getting wrong. On a refused save, and on a background
 * refetch that brings back a newer version, the editor's unsaved text is what has to survive:
 *
 *   - The save path showed a toast, which is accurate and gone in four seconds, on the one failure
 *     where somebody has to decide something.
 *   - The refetch path was worse. `staleTime` is a minute and `refetchOnWindowFocus` defaults to
 *     true, so an editor who looks away and comes back gets a fresh read, and the render-time
 *     re-seed replaced everything they had typed with the other person's version. No toast, no
 *     error, no race needed. A lost draft rather than a lost save.
 */
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return {
        ...actual,
        api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
    };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
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
const { default: ContentDetailPage } = await import('./page');

const ID = '6fb1d0c6-5217-4381-8bc8-4bb45302db0b';
const ETAG = '"01a07fec-36ea-4133-a252-5a2a73447dc4"';

const SCHEMA = {
    name: 'article',
    displayName: 'Article',
    isPubliclyDeliverable: true,
    fields: [{ name: 'Title', displayName: 'Title', type: 'string', required: true }],
};

function entry(version: number, title: string) {
    return {
        id: ID,
        contentType: 'article',
        data: { Title: title },
        status: ContentStatus.Draft,
        sensitivity: 'Public',
        version,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
    };
}

/** A 412 shaped exactly as the API returns it, errors[].reason and all. */
function conflict() {
    const detail = 'The content has been modified by another user. Please refresh and try again.';
    return Object.assign(new Error('Request failed with status code 412'), {
        isAxiosError: true,
        response: {
            status: 412,
            data: { status: 412, detail, errors: [{ name: 'version', reason: detail }] },
        },
    });
}

function renderEditor() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    // The page reads its route params with `use()`. An already-fulfilled thenable, in the shape
    // React reads directly, so the component renders on the first pass instead of suspending and
    // leaving every assertion racing the microtask queue.
    const params = Object.assign(Promise.resolve({ id: ID }), {
        status: 'fulfilled' as const,
        value: { id: ID },
    });

    return {
        client,
        ...render(
            <QueryClientProvider client={client}>
                <React.Suspense fallback={null}>
                    <ContentDetailPage params={params} />
                </React.Suspense>
            </QueryClientProvider>
        ),
    };
}

function routeGet(current: () => unknown) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types' || url.startsWith('/api/schemas')) {
            return { data: { items: [SCHEMA], totalItems: 1, page: 1, pageSize: 20 } };
        }
        if (url === `/api/contents/${ID}/history`) {
            return { data: { items: [], totalItems: 0, page: 1, pageSize: 20 } };
        }
        if (url === `/api/contents/${ID}`) return { data: current(), headers: { etag: ETAG } };
        return { data: { items: [], totalItems: 0, page: 1, pageSize: 20 } };
    });
}

describe('two editors, one entry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sends the ETag it read back as If-Match', async () => {
        // The API's stronger guard, bound to the document's own version rather than the event
        // stream's. It was unbuildable until the API exposed the header through CORS
        // (BaryoDev/barakoCMS#680); before that a browser could not read the ETag at all.
        routeGet(() => entry(1, 'original'));
        vi.mocked(api.put).mockResolvedValue({ data: { id: ID, version: 2 }, headers: {} });

        renderEditor();
        await screen.findByDisplayValue('original');
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());
        const [, , config] = vi.mocked(api.put).mock.calls[0];
        expect((config as { headers?: Record<string, string> })?.headers?.['If-Match']).toBe(ETAG);
    });

    it('sends no If-Match when the API sent no ETag, rather than an empty one', async () => {
        // An API that predates the ETag, or an event-sourced type, which the server deliberately
        // does not emit one for. `If-Match: ""` would be refused as malformed with a 400, turning
        // a working save into a broken one.
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/content-types') {
                return { data: { items: [SCHEMA], totalItems: 1, page: 1, pageSize: 20 } };
            }
            if (url === `/api/contents/${ID}/history`) {
                return { data: { items: [], totalItems: 0, page: 1, pageSize: 20 } };
            }
            if (url === `/api/contents/${ID}`) return { data: entry(1, 'original'), headers: {} };
            return { data: { items: [], totalItems: 0, page: 1, pageSize: 20 } };
        });
        vi.mocked(api.put).mockResolvedValue({ data: { id: ID, version: 2 }, headers: {} });

        renderEditor();
        await screen.findByDisplayValue('original');
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());
        const [, , config] = vi.mocked(api.put).mock.calls[0];
        expect((config as { headers?: Record<string, string> })?.headers ?? {}).not.toHaveProperty('If-Match');
    });

    it('sends the version it read, which is what makes the server able to refuse', async () => {
        routeGet(() => entry(1, 'original'));
        vi.mocked(api.put).mockResolvedValue({ data: { id: ID, version: 2 } });

        renderEditor();
        await screen.findByDisplayValue('original');

        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());
        const [, body] = vi.mocked(api.put).mock.calls[0];
        expect((body as { version: number }).version).toBe(1);
    });

    it('keeps what the editor typed when the save is refused, and says so where it stays put', async () => {
        routeGet(() => entry(1, 'original'));
        vi.mocked(api.put).mockRejectedValue(conflict());

        renderEditor();
        const field = await screen.findByDisplayValue('original');

        fireEvent.change(field, { target: { value: 'my unsaved work' } });
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());

        // The text is still theirs. A refused save must never cost them the thing they were saving.
        expect(screen.getByDisplayValue('my unsaved work')).toBeTruthy();

        // And the conflict is on the page, not only in a toast that has already gone.
        expect(await screen.findByText(/changed while you were editing/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
    });

    it('does not overwrite unsaved text when a background refetch brings back a newer version', async () => {
        let current = entry(1, 'original');
        routeGet(() => current);

        const { client } = renderEditor();
        const field = await screen.findByDisplayValue('original');
        fireEvent.change(field, { target: { value: 'my unsaved work' } });

        // Somebody else saves, and this editor's client refetches for its own reasons: a window
        // focus after `staleTime`, a reconnect, an invalidation from elsewhere on the page. Driven
        // directly rather than through a focus event, so the test fails when the re-seed is wrong
        // rather than when jsdom's focus handling is.
        current = entry(2, 'their version');
        await client.refetchQueries({ queryKey: ['contents', 'detail', ID] });
        await waitFor(() =>
            expect(client.getQueryData(['contents', 'detail', ID])).toMatchObject({ version: 2 })
        );

        expect(screen.getByDisplayValue('my unsaved work')).toBeTruthy();
        expect(screen.queryByDisplayValue('their version')).toBeNull();
    });
});
