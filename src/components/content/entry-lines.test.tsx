import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ContentTypeDefinition, FieldDefinition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { EntryLinesSection } = await import('./entry-lines');

function field(name: string, type: string, extra: Partial<FieldDefinition> = {}): FieldDefinition {
    return { name, displayName: name, type, isRequired: false, ...extra } as FieldDefinition;
}

const LINE_TYPE = {
    name: 'orderline',
    displayName: 'Order lines',
    fields: [
        field('Order', 'reference', { referenceType: 'order' }),
        field('Item', 'string'),
        field('Qty', 'int'),
    ],
} as ContentTypeDefinition;

const ORDER = {
    name: 'order',
    displayName: 'Order',
    fields: [],
    lines: { contentType: 'OrderLine', parentField: 'order' },
} as ContentTypeDefinition;

function pageOf<T>(items: T[]) {
    return { items, page: 1, pageSize: 100, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
}

function entry(id: string, data: Record<string, unknown>) {
    return { id, contentType: 'orderline', data, status: 'Published', createdAt: '2026-11-01T00:00:00Z' };
}

function serve(lines: unknown) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.startsWith('/api/content-types')) return { data: pageOf([ORDER, LINE_TYPE]) };
        if (url === '/api/contents/o-1/lines') return { data: lines };
        throw new Error(`unexpected ${url}`);
    });
}

function show(schema: ContentTypeDefinition = ORDER) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <EntryLinesSection id="o-1" schema={schema} />
        </QueryClientProvider>,
    );
}

describe('the lines of an entry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lists the lines, oldest first, without the field that points back', async () => {
        serve({
            header: entry('o-1', {}),
            truncated: false,
            lines: [
                entry('l-1', { Order: 'o-1', Item: 'Tea', Qty: 2 }),
                entry('l-2', { order: 'o-1', item: 'Cake', qty: 1 }),
            ],
        });
        show();

        expect(await screen.findByRole('heading', { name: 'Order lines' })).toBeInTheDocument();
        await waitFor(() =>
            expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Line', 'Item', 'Qty']),
        );
        const rows = (await screen.findAllByRole('row')).slice(1);
        expect(rows.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))).toEqual([
            ['1', 'Tea', '2'],
            ['2', 'Cake', '1'],
        ]);
        expect(screen.queryByText(/more lines than/)).toBeNull();
    });

    it('links each line to its own entry page', async () => {
        serve({
            header: entry('o-1', {}),
            truncated: false,
            lines: [entry('l-1', { Item: 'Tea' }), entry('l-2', { Item: 'Cake' })],
        });
        show();

        expect(await screen.findByRole('link', { name: 'Open line 1' })).toHaveAttribute('href', '/content/l-1');
        expect(screen.getByRole('link', { name: 'Open line 2' })).toHaveAttribute('href', '/content/l-2');
    });

    it('says when there are more lines than are listed', async () => {
        serve({ header: entry('o-1', {}), truncated: true, lines: [entry('l-1', { Item: 'Tea' })] });
        show();

        expect(await screen.findByText(/more lines than are listed here. The first 200 are shown/)).toBeInTheDocument();
    });

    it('says there are none for an entry with no lines', async () => {
        serve({ header: entry('o-1', {}), truncated: false, lines: [] });
        show();

        expect(await screen.findByText('No lines.')).toBeInTheDocument();
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('shows a line\'s text as text, not markup', async () => {
        serve({
            header: entry('o-1', {}),
            truncated: false,
            lines: [entry('l-1', { Item: '<b onmouseover=alert(1)>Tea</b>' })],
        });
        show();

        const cell = await screen.findByText('<b onmouseover=alert(1)>Tea</b>');
        expect(cell.querySelector('b')).toBeNull();
    });

    it('shows the server\'s reason when the lines cannot be read', async () => {
        const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST');
        error.response = {
            data: { errors: [{ name: 'generalErrors', reason: 'This content type declares no lines' }] },
            status: 400,
            statusText: '',
            headers: {},
            config: { headers: new AxiosHeaders() },
        };
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url.startsWith('/api/content-types')) return { data: pageOf([ORDER, LINE_TYPE]) };
            throw error;
        });
        show();

        expect(await screen.findByRole('alert')).toHaveTextContent('This content type declares no lines');
    });

    it('asks for nothing and shows nothing for a type with no lines', () => {
        vi.mocked(api.get).mockResolvedValue({ data: pageOf([]) });
        const { container } = show({ ...ORDER, lines: null });

        expect(container).toBeEmptyDOMElement();
        expect(api.get).not.toHaveBeenCalledWith('/api/contents/o-1/lines');
    });
});
