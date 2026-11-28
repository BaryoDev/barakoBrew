import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ContentTypeDefinition, FieldDefinition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix Select needs these to open in jsdom, as in uniqueness-panel.test.tsx.
beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
});

const { api } = await import('@/lib/api');
const { toast } = await import('sonner');
const { LinesDialog, LinesPanel } = await import('./lines-panel');

function field(name: string, type: string, extra: Partial<FieldDefinition> = {}): FieldDefinition {
    return { name, displayName: name, type, isRequired: false, ...extra } as FieldDefinition;
}

function type(name: string, displayName: string, fields: FieldDefinition[], extra: Partial<ContentTypeDefinition> = {}) {
    return { name, displayName, fields, ...extra } as ContentTypeDefinition;
}

const ORDER = type('salesorder', 'Sales order', [
    field('Reference', 'string'),
    field('Total', 'decimal'),
    field('Cost', 'decimal', { rollup: { source: 'lines' } }),
    field('Notes', 'text'),
]);

const ORDER_LINE = type('salesorderline', 'Order line', [
    // The case differs from the type's stored name on purpose: the API matches without regard to case.
    field('Order', 'reference', { referenceType: 'SalesOrder' }),
    field('Orders', 'reference', { referenceType: 'salesorder', multiple: true }),
    field('Customer', 'reference', { referenceType: 'customer' }),
    field('Qty', 'int'),
    field('LineTotal', 'decimal', { computed: { expression: 'Qty * 2' } }),
    field('Rolled', 'decimal', { rollup: { source: 'x' } }),
    field('Note', 'string'),
]);

const CUSTOMER = type('customer', 'Customer', [field('Name', 'string')]);

const INVOICE = type('invoice', 'Invoice', [], {
    lines: { contentType: 'invoiceline', parentField: 'Invoice' },
});
const INVOICE_LINE = type('invoiceline', 'Invoice line', [
    field('Invoice', 'reference', { referenceType: 'invoice' }),
]);

const TYPES = [ORDER, ORDER_LINE, CUSTOMER, INVOICE, INVOICE_LINE];

function pageOf<T>(items: T[]) {
    return { items, page: 1, pageSize: 100, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
}

function failure(status: number, errors: unknown) {
    const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST');
    error.response = {
        data: { status, errors },
        status,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    };
    return error;
}

function wrap(node: React.ReactNode, client?: QueryClient) {
    const queries =
        client ?? new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    return render(<QueryClientProvider client={queries}>{node}</QueryClientProvider>);
}

function dialog(schema: ContentTypeDefinition = ORDER, types: ContentTypeDefinition[] = TYPES, onOpenChange = vi.fn()) {
    wrap(<LinesDialog schema={schema} types={types} open onOpenChange={onOpenChange} />);
    return onOpenChange;
}

function open(name: string) {
    fireEvent.keyDown(screen.getByRole('combobox', { name }), { key: 'ArrowDown' });
}

function optionNames() {
    return within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent);
}

function choose(name: string, option: string) {
    open(name);
    const item = within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .find((o) => o.textContent === option);
    if (!item) throw new Error(`no option ${option}`);
    fireEvent.keyDown(item, { key: 'Enter' });
}

/** A line type and its parent field picked, which is all a save needs. */
function pickLineType() {
    choose('Line type', 'Order line');
    choose('Field that points back', 'Order');
}

describe('the lines dialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('offers the types that are not this one, have no lines and are not already a line type', () => {
        dialog();
        open('Line type');
        // Not the Sales order itself, not the Invoice (it has lines), not the Invoice line (it is one).
        expect(optionNames()).toEqual(['Order line', 'Customer']);
    });

    it('offers only single references to this type as the field that points back, whatever the case', () => {
        dialog();
        choose('Line type', 'Order line');
        open('Field that points back');
        // Orders is many-valued and Customer points elsewhere. Order names SalesOrder, which matches.
        expect(optionNames()).toEqual(['Order']);
    });

    it('says the line type needs a reference field when it has none to offer', () => {
        dialog();
        choose('Line type', 'Customer');

        expect(screen.getByText(/needs a single reference field to Sales order first/)).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Field that points back' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Save lines' })).toBeDisabled();
    });

    it('offers numbers on this type that are not rollups as the total', () => {
        dialog();
        pickLineType();
        open('Total field');
        expect(optionNames()).toEqual(['No total', 'Total']);
    });

    it('offers numbers on the line type that are not rollups as the line amount, computed ones included', () => {
        dialog();
        pickLineType();
        open('Line amount field');
        expect(optionNames()).toEqual(['No amount', 'Qty', 'LineTotal']);
    });

    it('will not send a total without a line amount, or the other way round', () => {
        dialog();
        pickLineType();
        const save = screen.getByRole('button', { name: 'Save lines' });
        expect(save).toBeEnabled();

        choose('Total field', 'Total');
        expect(save).toBeDisabled();
        expect(screen.getByText(/together, or leave both empty/)).toBeInTheDocument();
    });

    it('sets the lines with the total and amount together', async () => {
        vi.mocked(api.put).mockResolvedValueOnce({ data: { name: 'salesorder', lines: null } });
        const onOpenChange = dialog();
        pickLineType();
        choose('Total field', 'Total');
        choose('Line amount field', 'LineTotal');

        fireEvent.click(screen.getByRole('button', { name: 'Save lines' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0][0]).toBe('/api/content-types/salesorder/lines');
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({
            lines: {
                contentType: 'salesorderline',
                parentField: 'Order',
                totalField: 'Total',
                lineAmountField: 'LineTotal',
            },
        });
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(toast.success).toHaveBeenCalledWith('Lines saved');
    });

    it('sets lines with no total check and leaves the two fields out', async () => {
        vi.mocked(api.put).mockResolvedValueOnce({ data: { name: 'salesorder', lines: null } });
        dialog();
        pickLineType();

        fireEvent.click(screen.getByRole('button', { name: 'Save lines' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({
            lines: { contentType: 'salesorderline', parentField: 'Order' },
        });
    });

    it('encodes a type name with a space in the path', async () => {
        vi.mocked(api.put).mockResolvedValueOnce({ data: { name: 'Sales Order', lines: null } });
        const header = type('Sales Order', 'Sales order', []);
        const line = type('SO Line', 'Order line', [field('Order', 'reference', { referenceType: 'Sales Order' })]);
        dialog(header, [header, line]);
        pickLineType();

        fireEvent.click(screen.getByRole('button', { name: 'Save lines' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0][0]).toBe('/api/content-types/Sales%20Order/lines');
    });

    it('shows each error of a 400 on its own line', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(
            failure(400, [
                { name: 'generalErrors', reason: "'salesorderline' is already the line type of 'invoice'." },
                { name: 'generalErrors', reason: 'Total and line amount are set together or not at all.' },
            ]),
        );
        const onOpenChange = dialog();
        pickLineType();

        fireEvent.click(screen.getByRole('button', { name: 'Save lines' }));

        const alert = await screen.findByRole('alert');
        const items = within(alert).getAllByRole('listitem');
        expect(items.map((i) => i.textContent)).toEqual([
            "'salesorderline' is already the line type of 'invoice'.",
            'Total and line amount are set together or not at all.',
        ]);
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('shows a 422 the same way', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(failure(422, [{ name: 'generalErrors', reason: 'Refused by a rule.' }]));
        dialog();
        pickLineType();

        fireEvent.click(screen.getByRole('button', { name: 'Save lines' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Refused by a rule.');
    });

    it('shows the server\'s message for a 409 while a field change runs', async () => {
        const reason = "'salesorder' has a field change running (3f2c). Try again when it completes.";
        vi.mocked(api.put).mockRejectedValueOnce(failure(409, [{ name: 'name', reason }]));
        dialog();
        pickLineType();

        fireEvent.click(screen.getByRole('button', { name: 'Save lines' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(reason);
    });
});

describe('the lines panel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.get).mockResolvedValue({ data: pageOf(TYPES) });
    });

    it('shows No lines for a type that has none', async () => {
        wrap(<LinesPanel schema={ORDER} />);
        expect(await screen.findByText('No lines.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Clear lines' })).toBeNull();
    });

    it('shows the lines a listed type carries', async () => {
        const listed = {
            ...ORDER,
            lines: { contentType: 'SalesOrderLine', parentField: 'order', totalField: 'Total', lineAmountField: 'LineTotal' },
        };
        vi.mocked(api.get).mockResolvedValue({ data: pageOf([listed, ORDER_LINE, CUSTOMER]) });
        wrap(<LinesPanel schema={listed} />);

        expect(await screen.findByText('Order line')).toBeInTheDocument();
        expect(screen.getByText(/points back through Order/)).toBeInTheDocument();
        expect(screen.getByText(/Total has to equal the sum of LineTotal/)).toBeInTheDocument();
    });

    it('is disabled, and says why, for a type that is another type\'s line type', async () => {
        wrap(<LinesPanel schema={INVOICE_LINE} />);

        expect(await screen.findByText(/line type of Invoice, so it cannot have lines of its own/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Set lines' })).toBeDisabled();
    });

    it('clears the lines with null after a confirm, and refreshes the type list', async () => {
        vi.mocked(api.put).mockResolvedValueOnce({ data: { name: 'salesorder', lines: null } });
        const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        const withLines = { ...ORDER, lines: { contentType: 'salesorderline', parentField: 'Order' } };
        wrap(<LinesPanel schema={withLines} />, client);

        fireEvent.click(await screen.findByRole('button', { name: 'Clear lines' }));
        expect(api.put).not.toHaveBeenCalled();
        fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Clear lines' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0][0]).toBe('/api/content-types/salesorder/lines');
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({ lines: null });
        await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['schemas'] }));
        expect(toast.success).toHaveBeenCalledWith('Lines cleared');
    });

    it('shows a refused clear', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(failure(409, [{ name: 'name', reason: 'A field change is running.' }]));
        const withLines = { ...ORDER, lines: { contentType: 'salesorderline', parentField: 'Order' } };
        wrap(<LinesPanel schema={withLines} />);

        fireEvent.click(await screen.findByRole('button', { name: 'Clear lines' }));
        fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Clear lines' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('A field change is running.');
    });
});
