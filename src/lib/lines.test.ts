import { describe, it, expect } from 'vitest';
import {
    columnAmounts,
    decimalPlaces,
    lineColumns,
    lineTypeChoices,
    linePosition,
    linesPayload,
    parentFieldChoices,
    rowsToSend,
    splitLineRefusals,
    sumAmounts,
    totalDiffers,
} from './lines';
import type { ContentTypeDefinition, FieldDefinition } from '@/types/schema';

function field(name: string, type: string, extra: Partial<FieldDefinition> = {}): FieldDefinition {
    return { name, displayName: name, type, isRequired: false, ...extra } as FieldDefinition;
}

function type(name: string, fields: FieldDefinition[], extra: Partial<ContentTypeDefinition> = {}) {
    return { name, displayName: name, fields, ...extra } as ContentTypeDefinition;
}

const ORDER = type('order', [field('Total', 'decimal')]);
const LINE = type('orderline', [
    field('Order', 'reference', { referenceType: 'Order' }),
    field('Qty', 'int'),
    field('Token', 'token'),
    field('LineTotal', 'decimal', { computed: { expression: 'Qty * 2' } }),
    field('Rolled', 'decimal', { rollup: { source: 'x' } }),
    field('Note', 'string'),
]);

describe('adding amounts', () => {
    it('adds 0.1 and 0.2 to 0.3, which floats do not', () => {
        expect(0.1 + 0.2).not.toBe(0.3);
        const sum = sumAmounts([0.1, 0.2]);
        expect(sum.text).toBe('0.3');
        expect(totalDiffers(sum, 0.3)).toBe(false);
    });

    it('uses the money scale when one is declared, so 1.1 and 2.2 read 3.30 at two places', () => {
        expect(sumAmounts([1.1, 2.2], 2).text).toBe('3.30');
    });

    it('widens the scale to the most places entered when none is declared', () => {
        expect(sumAmounts([1, 0.125]).text).toBe('1.125');
        expect(sumAmounts([5, 7]).text).toBe('12');
    });

    it('handles negatives and no amounts at all', () => {
        expect(sumAmounts([-1.5, 0.25]).text).toBe('-1.25');
        expect(sumAmounts([]).text).toBe('0');
    });

    it('counts decimal places as written, exponents included', () => {
        expect(decimalPlaces(12)).toBe(0);
        expect(decimalPlaces(0.125)).toBe(3);
        expect(decimalPlaces(1e-7)).toBe(7);
        expect(decimalPlaces(1.5e3)).toBe(0);
    });

    it('compares a total to the sum at the finer scale', () => {
        expect(totalDiffers(sumAmounts([0.1, 0.2]), 0.31)).toBe(true);
        expect(totalDiffers(sumAmounts([10], 2), 10.0)).toBe(false);
        expect(totalDiffers(sumAmounts([10.25]), 10.2)).toBe(true);
    });

    it('reads a column without regard to the key spelling and skips what is not a number', () => {
        expect(columnAmounts([{ amount: 1 }, { Amount: 2 }, { Amount: '3' }, {}, { Amount: null }], 'Amount')).toEqual([
            1, 2,
        ]);
    });
});

describe('the lines a create sends', () => {
    it('keeps only the typed in columns, whatever a row holds', () => {
        const rows = [{ Order: 'x', Qty: 2, LineTotal: 9, Rolled: 1, Token: 't', Note: 'a', Stray: 1 }];
        expect(lineColumns(LINE, 'Order').map((f) => f.name)).toEqual(['Qty', 'Token', 'Note']);
        expect(rowsToSend(LINE, 'Order', rows)).toEqual([{ Qty: 2, Note: 'a' }]);
    });

    it('matches the parent field without regard to case', () => {
        expect(rowsToSend(LINE, 'order', [{ ORDER: 'x', Qty: 1 }])).toEqual([{ Qty: 1 }]);
    });

    it('sends a row with nothing entered as an empty object', () => {
        expect(linesPayload(LINE, 'Order', [{}, {}])).toEqual({ lines: [{}, {}] });
    });

    it('leaves the lines key out for an empty grid', () => {
        expect(linesPayload(LINE, 'Order', [])).toEqual({});
        expect('lines' in linesPayload(LINE, 'Order', [])).toBe(false);
    });
});

describe('choosing lines', () => {
    const invoice = type('invoice', [], { lines: { contentType: 'invoiceline', parentField: 'Invoice' } });
    const invoiceLine = type('invoiceline', []);
    const customer = type('customer', []);
    const types = [ORDER, LINE, customer, invoice, invoiceLine];

    it('offers types that are not this one, have no lines and are not another type\'s line type', () => {
        expect(lineTypeChoices(types, ORDER).map((t) => t.name)).toEqual(['orderline', 'customer']);
    });

    it('keeps the current line type in its own list', () => {
        const withLines = { ...ORDER, lines: { contentType: 'OrderLine', parentField: 'Order' } };
        expect(lineTypeChoices([withLines, LINE, customer], withLines).map((t) => t.name)).toEqual([
            'orderline',
            'customer',
        ]);
    });

    it('offers only single references to this type, whatever the case', () => {
        const line = type('l', [
            field('A', 'reference', { referenceType: 'ORDER' }),
            field('B', 'reference', { referenceType: 'order', multiple: true }),
            field('C', 'reference', { referenceType: 'customer' }),
            field('D', 'string'),
        ]);
        expect(parentFieldChoices(line, 'order').map((f) => f.name)).toEqual(['A']);
    });
});

describe('refusals about lines', () => {
    it('reads the position a refusal names', () => {
        expect(linePosition("Line 3: 'Qty' is missing.")).toBe(3);
        expect(linePosition('Something else')).toBeNull();
    });

    it('splits what belongs at the grid from the rest', () => {
        const split = splitLineRefusals([
            "'Total' is 5, but the lines add up to 6.",
            'Line 2: Name is required',
            'Data is required',
        ]);
        expect(split.grid).toEqual(["'Total' is 5, but the lines add up to 6.", 'Line 2: Name is required']);
        expect(split.rest).toEqual(['Data is required']);
    });
});
