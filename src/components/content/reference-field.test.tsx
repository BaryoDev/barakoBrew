import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

function entry(id: string) {
    const found = ENTRIES.find((e) => e.id === id);
    if (!found) throw Object.assign(new Error('Not found'), { response: { status: 404 } });
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

/** The search terms the entry list was asked for, in order. */
function searchesAsked(): (string | undefined)[] {
    return vi
        .mocked(api.get)
        .mock.calls.filter(([url]) => url === '/api/contents')
        .map(([, config]) => (config as { params: { search?: string } }).params.search);
}

function listCalls(): number {
    return searchesAsked().length;
}

// cmdk measures its list, and jsdom has no ResizeObserver, so the dialog cannot open without this.
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockImplementation(async (url: string, config?: unknown) => {
        if (url === '/api/content-types') {
            return {
                data: pageOf([{ name: 'author', displayName: 'Author', fields: [] }]),
            } as never;
        }
        if (url === '/api/contents') {
            const params = (config as { params: { contentType?: string; search?: string } }).params;
            const matching = ENTRIES.filter(
                (e) =>
                    params.contentType === 'author' &&
                    (!params.search ||
                        e.data.Name.toLowerCase().includes(params.search.toLowerCase()))
            );
            return { data: pageOf(matching) } as never;
        }
        if (url.startsWith('/api/contents/')) {
            return { data: entry(url.slice('/api/contents/'.length)), headers: {} } as never;
        }
        throw new Error(`unstubbed GET ${url}`);
    });
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

    it('clears the value rather than leaving an id nobody can read', async () => {
        const onChange = vi.fn();
        renderForm(AUTHOR_FIELD, { Author: AUTHOR_ID }, onChange);

        fireEvent.click(await screen.findByRole('button', { name: 'Clear Author' }));

        expect(onChange).toHaveBeenCalledWith({ Author: null });
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
