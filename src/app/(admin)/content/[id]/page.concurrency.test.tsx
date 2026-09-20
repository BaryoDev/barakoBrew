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
    fields: [
        { name: 'Title', displayName: 'Title', type: 'string', required: true },
        // A second field, so a test can have two people edit different parts of one entry. With one
        // field every concurrent edit is a collision and the merge has nothing to show.
        { name: 'Body', displayName: 'Body', type: 'string', required: false },
    ],
};

function entry(version: number, title: string, body = 'the body') {
    return {
        id: ID,
        contentType: 'article',
        data: { Title: title, Body: body },
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

/**
 * The same two editors, against a stand-in for the API rather than a fixed answer.
 *
 * A mock that always resolves cannot tell a save that was refused from one that was never stale, so
 * it cannot show the difference between refusing a second edit and letting it win. This one holds
 * an entry, refuses a write whose version is not the one it holds, and applies one that is. A save
 * that overwrites somebody leaves that visible in what it ends up holding.
 */
describe('two editors, one entry, against a server that checks the version', () => {
    let server: Omit<ReturnType<typeof entry>, 'data'> & { data: Record<string, unknown> };

    beforeEach(() => {
        vi.clearAllMocks();
        server = entry(1, 'original', 'the body');
        routeGet(() => server);
        vi.mocked(api.put).mockImplementation(async (_url: string, body: unknown) => {
            const sent = body as { version: number; data: Record<string, unknown> };
            if (sent.version !== server.version) throw conflict();
            server = { ...server, version: server.version + 1, data: sent.data };
            return { data: { id: ID, version: server.version }, headers: { etag: `"v${server.version}"` } };
        });
    });

    it('refuses the second of two edits to the same field instead of letting it win', async () => {
        const { client } = renderEditor();
        const title = await screen.findByDisplayValue('original');
        fireEvent.change(title, { target: { value: 'my unsaved work' } });

        // Somebody else saves the same field, and this client learns about it the way it does in
        // life: a refetch it did for its own reasons.
        server = entry(2, 'their version', 'the body');
        await client.refetchQueries({ queryKey: ['contents', 'detail', ID] });
        expect(await screen.findByText(/while you were editing/i)).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));

        // Written against the version this editor read, which is what lets the server refuse it.
        // Sending the version the refetch brought back is what used to make this save succeed.
        expect((vi.mocked(api.put).mock.calls[0][1] as { version: number }).version).toBe(1);

        // Their save is still what is stored. Nothing of this editor's was silently written over it.
        expect(server.data.Title).toBe('their version');
        expect(server.version).toBe(2);

        // And this editor still has their text and the question in front of them.
        expect(screen.getByDisplayValue('my unsaved work')).toBeTruthy();
        expect(await screen.findByText(/changed Title while you were editing/i)).toBeTruthy();
    });

    it('saves over a change somebody else made to a field this editor did not touch', async () => {
        renderEditor();
        const body = await screen.findByDisplayValue('the body');
        fireEvent.change(body, { target: { value: 'my new body' } });

        // Their edit lands after this editor read the entry and before it saves, so the first write
        // is refused.
        server = entry(2, 'their title', 'the body');

        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
        const sent = vi.mocked(api.put).mock.calls[1][1] as { data: Record<string, unknown>; version: number };
        expect(sent.version).toBe(2);
        expect(sent.data).toEqual({ Title: 'their title', Body: 'my new body' });

        // Both survive, which is the whole point: their title is still theirs and this body is saved.
        expect(server.version).toBe(3);
        expect(server.data).toEqual({ Title: 'their title', Body: 'my new body' });
        expect(screen.queryByText(/while you were editing/i)).toBeNull();
    });

    it('does not read its own save as somebody else changing the entry', async () => {
        const { client } = renderEditor();
        const title = await screen.findByDisplayValue('original');
        fireEvent.change(title, { target: { value: 'my work' } });

        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));

        // The invalidation the mutation fires brings the entry back at its new version. That is this
        // editor's own write coming home, not a conflict.
        await client.refetchQueries({ queryKey: ['contents', 'detail', ID] });
        await waitFor(() =>
            expect(client.getQueryData(['contents', 'detail', ID])).toMatchObject({ version: 2 })
        );

        expect(screen.queryByText(/while you were editing/i)).toBeNull();
        expect(screen.getByDisplayValue('my work')).toBeTruthy();
    });

    it('sends the ETag the write answered with, not nothing, on a second save', async () => {
        // A deployment with Content:Concurrency:Require on refuses a write carrying no If-Match with
        // a 428. A screen that stays open after a save has to keep the ETag that save answered with,
        // or the second save from that screen is the one that fails.
        renderEditor();
        const title = await screen.findByDisplayValue('original');

        fireEvent.change(title, { target: { value: 'first' } });
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));

        fireEvent.change(screen.getByDisplayValue('first'), { target: { value: 'second' } });
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));

        const [, , config] = vi.mocked(api.put).mock.calls[1];
        expect((config as { headers?: Record<string, string> })?.headers?.['If-Match']).toBe('"v2"');
    });
});
