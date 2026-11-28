import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LinesGrid, type LineRow } from './lines-grid';
import { MAX_LINES, rowsToSend } from '@/lib/lines';
import type { ContentTypeDefinition, FieldDefinition, LinesDefinition } from '@/types/schema';

function field(name: string, type: string, extra: Partial<FieldDefinition> = {}): FieldDefinition {
    return { name, displayName: name, type, isRequired: false, ...extra } as FieldDefinition;
}

function type(name: string, fields: FieldDefinition[]) {
    return { name, displayName: name, fields } as ContentTypeDefinition;
}

const HEADER = type('order', [field('Total', 'decimal')]);
const LINES: LinesDefinition = { contentType: 'orderline', parentField: 'Order' };
const WITH_TOTAL: LinesDefinition = { ...LINES, totalField: 'Total', lineAmountField: 'Amount' };

const LINE = type('orderline', [
    field('Order', 'reference', { referenceType: 'Order' }),
    field('Item', 'string'),
    field('Amount', 'decimal'),
    field('Worked', 'decimal', { computed: { expression: 'Amount * 2' } }),
    field('Rolled', 'decimal', { rollup: { source: 'x' } }),
]);

const MONEY_LINE = type('orderline', [
    field('Order', 'reference', { referenceType: 'Order' }),
    field('Amount', 'money', { currency: 'USD' }),
]);

function rowsOf(values: Record<string, unknown>[]): LineRow[] {
    return values.map((v, i) => ({ id: i + 1, values: v }));
}

function Harness({
    lines = LINES,
    lineType = LINE,
    headerValues = {},
    initial = [],
    refusals,
    onRows,
}: {
    lines?: LinesDefinition;
    lineType?: ContentTypeDefinition;
    headerValues?: Record<string, unknown>;
    initial?: LineRow[];
    refusals?: string[];
    onRows?: (rows: LineRow[]) => void;
}) {
    const [rows, setRows] = useState(initial);
    return (
        <LinesGrid
            lines={lines}
            lineType={lineType}
            header={HEADER}
            headerValues={headerValues}
            rows={rows}
            onChange={(next) => {
                setRows(next);
                onRows?.(next);
            }}
            refusals={refusals}
        />
    );
}

/** The input of a field on a line, found by the name it has: the field and the line number. */
function typeInto(label: string, line: number, value: string) {
    fireEvent.change(screen.getByLabelText(`${label}, line ${line}`), { target: { value } });
}

describe('the lines grid', () => {
    it('says there are no lines yet, and adds a row', () => {
        const onRows = vi.fn();
        render(<Harness onRows={onRows} />);
        expect(screen.getByText('No lines yet.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add line' }));

        expect(screen.getByRole('button', { name: 'Remove line 2' })).toBeInTheDocument();
        expect(onRows.mock.lastCall![0]).toHaveLength(2);
        expect(screen.queryByText('No lines yet.')).toBeNull();
    });

    it('removes the row asked for and keeps what the others hold', () => {
        render(<Harness initial={rowsOf([{ Item: 'a' }, { Item: 'b' }, { Item: 'c' }])} />);

        fireEvent.click(screen.getByRole('button', { name: 'Remove line 2' }));

        // The lines are numbered again, so the second input is now the old third.
        expect(screen.getByLabelText('Item, line 1')).toHaveValue('a');
        expect(screen.getByLabelText('Item, line 2')).toHaveValue('c');
        expect(screen.queryByLabelText('Item, line 3')).toBeNull();
    });

    it('stops at 200 lines and says so', () => {
        render(<Harness initial={rowsOf(Array.from({ length: MAX_LINES }, () => ({})))} />);

        expect(MAX_LINES).toBe(200);
        expect(screen.getByRole('button', { name: 'Add line' })).toBeDisabled();
        expect(screen.getByText('An entry takes at most 200 lines.')).toBeInTheDocument();
    });

    it('still takes a line one short of the cap', () => {
        render(<Harness initial={rowsOf(Array.from({ length: MAX_LINES - 1 }, () => ({})))} />);
        expect(screen.getByRole('button', { name: 'Add line' })).toBeEnabled();
    });

    it('leaves the parent, computed and rolled up fields out of the columns', () => {
        render(<Harness initial={rowsOf([{}])} />);

        expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
            'Line',
            'Item',
            'Amount',
            'Remove',
        ]);
        expect(screen.queryByLabelText(/^Order/)).toBeNull();
        expect(screen.queryByLabelText(/^Worked/)).toBeNull();
        expect(screen.queryByLabelText(/^Rolled/)).toBeNull();
    });

    it('says there is nothing to enter when no column is left, and still adds rows', () => {
        const bare = type('orderline', [field('Order', 'reference', { referenceType: 'Order' })]);
        render(<Harness lineType={bare} />);

        expect(screen.getByText('Nothing to enter on a line.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
        expect(screen.getByRole('button', { name: 'Remove line 1' })).toBeInTheDocument();
    });

    it('keeps each row\'s inputs apart', () => {
        render(<Harness initial={rowsOf([{}, {}])} />);
        const ids = [screen.getByLabelText('Item, line 1').id, screen.getByLabelText('Item, line 2').id];
        expect(new Set(ids).size).toBe(2);
    });

    it('names each line by its number, as a row header, so a screen reader hears which line an input is on', () => {
        render(<Harness initial={rowsOf([{}, {}])} />);

        expect(screen.getByRole('rowheader', { name: '1' })).toHaveAttribute('scope', 'row');
        expect(screen.getByRole('rowheader', { name: '2' })).toBeInTheDocument();
        expect(screen.getByLabelText('Amount, line 2')).toBeInTheDocument();
    });

    it('builds the payload from what was typed, without the fields the server sets', () => {
        const onRows = vi.fn();
        render(<Harness initial={rowsOf([{}, {}])} onRows={onRows} />);

        typeInto('Item', 1, 'Tea');
        typeInto('Amount', 1, '2.5');
        typeInto('Item', 2, 'Cake');

        const rows = onRows.mock.lastCall![0] as LineRow[];
        const sent = rowsToSend(
            LINE,
            'Order',
            rows.map((r) => ({ ...r.values, Order: 'x', Worked: 1, Rolled: 2 })),
        );
        expect(sent).toEqual([{ Item: 'Tea', Amount: 2.5 }, { Item: 'Cake' }]);
    });
});

describe('the sum of the lines', () => {
    it('adds 0.1 and 0.2 to 0.3 and does not warn against a total of 0.3', () => {
        render(<Harness lines={WITH_TOTAL} headerValues={{ Total: 0.3 }} initial={rowsOf([{ Amount: 0.1 }, { Amount: 0.2 }])} />);

        expect(screen.getByText('0.3')).toBeInTheDocument();
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('follows the money scale of the amount field', () => {
        render(
            <Harness
                lines={WITH_TOTAL}
                lineType={MONEY_LINE}
                headerValues={{ Total: 3.3 }}
                initial={rowsOf([{ Amount: 1.1 }, { Amount: 2.2 }])}
            />,
        );

        expect(screen.getByText('3.30')).toBeInTheDocument();
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('updates as an amount is typed', () => {
        render(<Harness lines={WITH_TOTAL} headerValues={{ Total: 3 }} initial={rowsOf([{}, {}])} />);
        expect(screen.getByText('0')).toBeInTheDocument();

        typeInto('Amount', 1, '1.25');
        typeInto('Amount', 2, '1.75');

        expect(screen.getByText('3.00')).toBeInTheDocument();
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('warns when the total is a different amount', () => {
        render(<Harness lines={WITH_TOTAL} headerValues={{ Total: 5 }} initial={rowsOf([{ Amount: 0.1 }, { Amount: 0.2 }])} />);

        expect(screen.getByRole('status')).toHaveTextContent('Total is 5, but the lines add up to 0.3.');
    });

    it('warns when no total is entered yet', () => {
        render(<Harness lines={WITH_TOTAL} initial={rowsOf([{ Amount: 4 }])} />);

        expect(screen.getByRole('status')).toHaveTextContent('Total is not entered. It has to equal the lines, 4.');
    });

    it('does not compare a total the server works out', () => {
        const computedHeader = type('order', [field('Total', 'decimal', { computed: { expression: '1' } })]);
        render(
            <LinesGrid
                lines={WITH_TOTAL}
                lineType={LINE}
                header={computedHeader}
                headerValues={{}}
                rows={rowsOf([{ Amount: 4 }])}
                onChange={() => {}}
            />,
        );
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('says the sum is worked out on save when the amount is computed', () => {
        render(
            <Harness
                lines={{ ...LINES, totalField: 'Total', lineAmountField: 'Worked' }}
                headerValues={{ Total: 9 }}
                initial={rowsOf([{ Amount: 1 }])}
            />,
        );

        expect(screen.getByText(/worked out when the entry is saved/)).toBeInTheDocument();
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('shows no sum when the type checks no total', () => {
        render(<Harness initial={rowsOf([{ Amount: 1 }])} />);
        expect(screen.queryByText(/Sum of/)).toBeNull();
    });
});

describe('what the server refused', () => {
    it('puts a line refusal under its row and the others under the grid', () => {
        render(
            <Harness
                initial={rowsOf([{}, {}])}
                refusals={[
                    "Line 2: 'Amount' is missing.",
                    "'Total' is 5, but the lines add up to 6.",
                    'Line 9: no such row.',
                ]}
            />,
        );

        const alerts = screen.getAllByRole('alert');
        expect(alerts).toHaveLength(2);
        expect(within(alerts[0]).getByText("Line 2: 'Amount' is missing.")).toBeInTheDocument();
        expect(alerts[0].closest('tr')?.previousElementSibling).toHaveTextContent('2');
        expect(within(alerts[1]).getAllByRole('listitem').map((i) => i.textContent)).toEqual([
            "'Total' is 5, but the lines add up to 6.",
            'Line 9: no such row.',
        ]);
    });

    it('renders server text as text, not markup', () => {
        render(<Harness initial={rowsOf([{}])} refusals={['Line 1: <img src=x onerror=alert(1)>']} />);
        expect(screen.getByRole('alert').querySelector('img')).toBeNull();
        expect(screen.getByRole('alert')).toHaveTextContent('<img src=x onerror=alert(1)>');
    });
});
