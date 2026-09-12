import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ContentStatus, SensitivityLevel } from '@/types/content';
import type { FieldDefinition } from '@/types/schema';

/**
 * A reference field, which used to be a box for pasting a GUID into.
 *
 * These drive the real DynamicForm against a stubbed api, because the thing under test is the whole
 * path: the target type arriving on the definition, the entries of that type being fetched, and the
 * titles standing in for the ids. A test that rendered the picker directly with entries handed to it
 * would pass with `referenceType` thrown away, which is the bug.
 */
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { DynamicForm } = await import('./dynamic-form');

const AUTHOR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

const ENTRIES = [
    { id: AUTHOR_ID, data: { Name: 'Arnel Robles' } },
    { id: OTHER_ID, data: { Name: 'Juan dela Cruz' } },
];

function pageOf<T>(items: T[]) {
    return {
        items,
        page: 1,
        pageSize: 20,
        totalItems: items.length,
        totalPages: items.length === 0 ? 0 : 1,
        hasNextPage: false,
        hasPreviousPage: false,
    };
}

/**
 * A real AxiosError, not an object shaped like one.
 *
 * `axios.isAxiosError` checks a marker the constructor sets, so a hand-rolled `{ response: { status } }`
 * is invisible to every helper in `lib/api` that reads a status. A stub that throws one would let the
 * component treat a 404 as a transport failure and the test would never notice.
 */
function axiosFailure(status: number, data: unknown = {}) {
    const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST');
    error.response = {
        data,
        status,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    };
    return error;
}

/** What axios throws when the request never got an answer: no response at all. */
function networkFailure() {
    return new AxiosError('Network Error', 'ERR_NETWORK');
}

function entry(id: string) {
    const found = ENTRIES.find((e) => e.id === id);
    if (!found) throw axiosFailure(404, { message: 'Content not found' });
    return {
        id: found.id,
        contentType: 'author',
        data: found.data,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
        status: ContentStatus.Published,
        sensitivity: SensitivityLevel.Public,
        version: 1,
    };
}

function listParams(): { contentType?: string; search?: string }[] {
    return vi
        .mocked(api.get)
        .mock.calls.filter(([url]) => url === '/api/contents')
        .map(([, config]) => (config as { params: { contentType?: string; search?: string } }).params);
}

/** The search terms the entry list was asked for, in order. */
function searchesAsked(): (string | undefined)[] {
    return listParams().map((p) => p.search);
}

/** The content types the entry list was asked for, in order. */
function typesAsked(): (string | undefined)[] {
    return listParams().map((p) => p.contentType);
}

function listCalls(): number {
    return listParams().length;
}

// cmdk measures its list, and jsdom has no ResizeObserver, so the dialog cannot open without this.
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

/**
 * Per-request failures a test can inject. Each returns the error to throw, or nothing to let the
 * request through, so a test can fail a call once and then let the retry succeed.
 */
interface Failures {
    list?: () => unknown;
    detail?: () => unknown;
}

/**
 * The API as the console meets it: one content type named `author`, and the entries it holds.
 *
 * The entry list is filtered on `contentType === 'author'` exactly, the way the server's list
 * endpoint does, so asking for any other spelling of the name comes back empty rather than coming
 * back anyway.
 */
function stubApi(entries: typeof ENTRIES, fail: Failures = {}) {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockImplementation(async (url: string, config?: unknown) => {
        if (url === '/api/content-types') {
            return {
                data: pageOf([{ name: 'author', displayName: 'Author', fields: [] }]),
            } as never;
        }
        if (url === '/api/contents') {
            const thrown = fail.list?.();
            if (thrown) throw thrown;
            const params = (config as { params: { contentType?: string; search?: string } }).params;
            const matching = entries.filter(
                (e) =>
                    params.contentType === 'author' &&
                    (!params.search ||
                        e.data.Name.toLowerCase().includes(params.search.toLowerCase()))
            );
            return { data: pageOf(matching) } as never;
        }
        if (url.startsWith('/api/contents/')) {
            const thrown = fail.detail?.();
            if (thrown) throw thrown;
            return { data: entry(url.slice('/api/contents/'.length)), headers: {} } as never;
        }
        throw new Error(`unstubbed GET ${url}`);
    });
}

beforeEach(() => {
    stubApi(ENTRIES);
});

const AUTHOR_FIELD: FieldDefinition = {
    name: 'Author',
    displayName: 'Author',
    type: 'reference',
    referenceType: 'author',
    isRequired: false,
};

function Providers({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderForm(
    field: FieldDefinition,
    values: Record<string, unknown> = {},
    onChange: (values: Record<string, unknown>) => void = () => {}
) {
    render(
        <Providers>
            <DynamicForm fields={[field]} values={values} onChange={onChange} />
        </Providers>
    );
    return document.getElementById(field.name)!;
}

describe('a reference field whose definition names the type it points at', () => {
    it('is a picker, not a box to paste a GUID into', async () => {
        const control = renderForm(AUTHOR_FIELD);
        expect(control.tagName).toBe('BUTTON');
        // The target type by its display name once the type list resolves, so the editor is told
        // what they are choosing rather than reading the API's name for it.
        expect(control).toHaveTextContent('Choose author');
        await waitFor(() => expect(control).toHaveTextContent('Choose Author'));
        // The zero GUID placeholder was the whole defect.
        expect(document.body.textContent).not.toContain('00000000-0000-0000-0000-000000000000');
    });

    it('does not fetch the entries of the target type until it is opened', async () => {
        const control = renderForm(AUTHOR_FIELD);
        // The content type list is fetched either way, to resolve the target's display name.
        await waitFor(() => expect(control).toHaveTextContent('Choose Author'));
        expect(listCalls()).toBe(0);

        fireEvent.click(control);
        await waitFor(() => expect(listCalls()).toBe(1));
    });

    it('shows the chosen entry by its title, not by its id', async () => {
        const control = renderForm(AUTHOR_FIELD, { Author: AUTHOR_ID });
        await waitFor(() => expect(control).toHaveTextContent('Arnel Robles'));
        expect(control.textContent).not.toContain(AUTHOR_ID);
    });

    it('keeps the id visible when it resolves to no entry, rather than showing nothing', async () => {
        const missing = '33333333-3333-4333-8333-333333333333';
        const control = renderForm(AUTHOR_FIELD, { Author: missing });
        await waitFor(() => expect(control).toHaveTextContent(missing));
        expect(
            await screen.findByText(/does not resolve to an entry this console can read/)
        ).toBeInTheDocument();
    });

    it('lists the entries of that type by title and stores the id of the one picked', async () => {
        const onChange = vi.fn();
        const control = renderForm(AUTHOR_FIELD, {}, onChange);

        fireEvent.click(control);

        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(2);
        expect(options.map((o) => o.textContent)).toEqual([
            expect.stringContaining('Arnel Robles'),
            expect.stringContaining('Juan dela Cruz'),
        ]);

        fireEvent.click(screen.getByText('Juan dela Cruz'));

        expect(onChange).toHaveBeenCalledWith({ Author: OTHER_ID });
    });

    it('asks the server for the search, rather than filtering the page it already has', async () => {
        const control = renderForm(AUTHOR_FIELD);
        fireEvent.click(control);
        await waitFor(() => expect(listCalls()).toBe(1));

        fireEvent.change(await screen.findByPlaceholderText('Search Author'), {
            target: { value: 'juan' },
        });

        // Debounced, so this is the search arriving at the server at all, not one call per keystroke.
        await waitFor(() => expect(searchesAsked()).toContain('juan'));
        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(1);
        expect(options[0]).toHaveTextContent('Juan dela Cruz');
    });

    it('says so when the target type holds no entries at all', async () => {
        stubApi([]);
        const control = renderForm(AUTHOR_FIELD);

        fireEvent.click(control);

        expect(await screen.findByText('There are no Author entries yet.')).toBeInTheDocument();
        expect(screen.queryAllByRole('option')).toHaveLength(0);
    });

    it('says so when a search matches none of them, rather than showing the last page again', async () => {
        const control = renderForm(AUTHOR_FIELD);
        fireEvent.click(control);
        // A live list first, so the copy below cannot pass on a dialog that never listed anything.
        expect(await screen.findAllByRole('option')).toHaveLength(2);

        fireEvent.change(await screen.findByPlaceholderText('Search Author'), {
            target: { value: 'nobody' },
        });

        await waitFor(() => expect(searchesAsked()).toContain('nobody'));
        expect(
            await screen.findByText('No Author entries match that search.')
        ).toBeInTheDocument();
        expect(screen.queryAllByRole('option')).toHaveLength(0);
    });

    it('clears the value rather than leaving an id nobody can read', async () => {
        const onChange = vi.fn();
        renderForm(AUTHOR_FIELD, { Author: AUTHOR_ID }, onChange);

        fireEvent.click(await screen.findByRole('button', { name: 'Clear Author' }));

        expect(onChange).toHaveBeenCalledWith({ Author: null });
    });
});

describe('a reference field whose reads fail', () => {
    /**
     * The distinction these hold: a 404 is a fact about the value, anything else is a fact about the
     * connection. The component used to report both as "this id does not resolve", which told an
     * editor their reference was broken every time the network blinked and sent them off to change
     * data that was fine.
     */

    it('separates an id that is not there from an id it could not check', async () => {
        stubApi(ENTRIES, { detail: () => networkFailure() });
        renderForm(AUTHOR_FIELD, { Author: AUTHOR_ID });

        expect(await screen.findByText(/could not be read/)).toBeInTheDocument();
        expect(
            screen.queryByText(/does not resolve to an entry this console can read/)
        ).not.toBeInTheDocument();
    });

    it('offers the reader the retry that a transport failure actually calls for', async () => {
        let attempts = 0;
        stubApi(ENTRIES, { detail: () => (attempts++ === 0 ? networkFailure() : null) });
        const control = renderForm(AUTHOR_FIELD, { Author: AUTHOR_ID });

        fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

        await waitFor(() => expect(control).toHaveTextContent('Arnel Robles'));
        expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument();
    });

    it('does not offer a retry for a 404, because trying again cannot find it', async () => {
        const missing = '33333333-3333-4333-8333-333333333333';
        renderForm(AUTHOR_FIELD, { Author: missing });

        expect(
            await screen.findByText(/does not resolve to an entry this console can read/)
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    });

    it('says the list could not be read, rather than that the type holds nothing', async () => {
        stubApi(ENTRIES, { list: () => axiosFailure(503, { message: 'The database is unavailable.' }) });
        const control = renderForm(AUTHOR_FIELD);

        fireEvent.click(control);

        // The server's own sentence, the way every other refused request in this console renders.
        expect(await screen.findByText('The database is unavailable.')).toBeInTheDocument();
        // The claim the empty branch would have made on the same state, which it had no grounds for.
        expect(screen.queryByText('There are no Author entries yet.')).not.toBeInTheDocument();
        expect(screen.queryAllByRole('option')).toHaveLength(0);
    });

    it('retries the list from that state and shows the entries', async () => {
        let attempts = 0;
        stubApi(ENTRIES, { list: () => (attempts++ === 0 ? axiosFailure(503) : null) });
        const control = renderForm(AUTHOR_FIELD);

        fireEvent.click(control);
        fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(2);
    });
});

describe('the keyboard, once the picker closes', () => {
    /**
     * The dialog is opened from a plain button rather than a DialogTrigger, and choosing an entry
     * closes it from inside the list. What focus returns to is then whatever radix happened to record
     * at mount, so it is pinned explicitly and held here on both exits. Losing it drops a keyboard
     * user at the top of the document, in a form they were part way through.
     */

    it('returns focus to the field after an entry is chosen', async () => {
        const control = renderForm(AUTHOR_FIELD);
        control.focus();
        fireEvent.click(control);

        fireEvent.click(await screen.findByText('Juan dela Cruz'));

        await waitFor(() => expect(document.activeElement).toBe(control));
    });

    it('returns focus to the field after the dialog is dismissed', async () => {
        const control = renderForm(AUTHOR_FIELD);
        control.focus();
        fireEvent.click(control);
        await screen.findAllByRole('option');

        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

        await waitFor(() => expect(document.activeElement).toBe(control));
    });
});

describe('a reference field whose definition spells the target type differently', () => {
    /**
     * `referenceType: 'Author'` against a type named `author`, which the API allows: it compares the
     * two case-insensitively when it validates a reference. The entry list does not, it filters on an
     * exact match, so the picker has to ask with the name the type itself carries. Asking with the
     * definition's spelling returns an empty list and the picker offers nothing.
     */
    const FIELD: FieldDefinition = { ...AUTHOR_FIELD, referenceType: 'Author' };

    it('asks the entry list for the name the content type itself carries', async () => {
        const control = renderForm(FIELD);

        fireEvent.click(control);

        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(2);
        expect(typesAsked()).toEqual(['author']);
    });
});

describe('a reference field whose definition names no target type', () => {
    it('stays the id box, because there is nothing to search', () => {
        const control = renderForm({
            name: 'Author',
            displayName: 'Author',
            type: 'reference',
            isRequired: false,
        });
        expect(control.tagName).toBe('INPUT');
        expect(control).toHaveAttribute('type', 'text');
    });
});
