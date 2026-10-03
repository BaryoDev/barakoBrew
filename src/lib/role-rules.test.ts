import { describe, it, expect } from 'vitest';
import { emptyPermission } from '@/types/rbac';
import { conditionProblem, hasFieldSet, isEmptyPermission, readConditions, writeConditions } from './role-rules';

describe('reading a rule conditions', () => {
    it('shows one operator over text as a row and keeps every other shape as stored', () => {
        const { rows, kept } = readConditions({
            'Class.InstructorUser': { _eq: '$CURRENT_USER' },
            Branch: { _in: ['north', 'south'] },
            Seats: { _eq: 4 },
            Status: { _eq: 'Open', _ne: 'Closed' },
            Owner: { _contains: 'x' },
        });

        expect(rows).toEqual([
            { key: 'Class.InstructorUser', operator: '_eq', value: '$CURRENT_USER' },
            { key: 'Branch', operator: '_in', value: 'north, south' },
        ]);
        expect(Object.keys(kept)).toEqual(['Seats', 'Status', 'Owner']);
    });

    it('writes the rows back beside the kept conditions, with a list operator as a list', () => {
        const { rows, kept } = readConditions({ Seats: { _eq: 4 } });
        const written = writeConditions(
            [...rows, { key: 'Branch', operator: '_nin', value: 'north, , south' }],
            kept,
        );
        expect(written).toEqual({ Seats: { _eq: 4 }, Branch: { _nin: ['north', 'south'] } });
    });

    it('writes no conditions as null, which is what a rule without any holds', () => {
        expect(writeConditions([{ key: ' ', operator: '_eq', value: 'x' }], {})).toBeNull();
    });
});

describe('the shape of a condition the API checks', () => {
    it('accepts Reference.Field', () => {
        expect(conditionProblem({ key: 'Class.InstructorUser', operator: '_eq', value: '$CURRENT_USER' })).toBeNull();
    });

    it('refuses two hops and a name that does not start with a letter', () => {
        expect(conditionProblem({ key: 'Class.Teacher.User', operator: '_eq', value: 'x' })).toMatch(/Reference\.Field/);
        expect(conditionProblem({ key: '1Class.User', operator: '_eq', value: 'x' })).toMatch(/Reference\.Field/);
    });

    it('refuses a list operator with no value', () => {
        expect(conditionProblem({ key: 'Branch', operator: '_in', value: ' , ' })).toMatch(/at least one value/);
    });
});

describe('field sets', () => {
    it('reads absent, null and empty as no set', () => {
        expect(hasFieldSet({ enabled: true }, 'readableFields')).toBe(false);
        expect(hasFieldSet({ enabled: true, readableFields: null }, 'readableFields')).toBe(false);
        expect(hasFieldSet({ enabled: true, readableFields: [] }, 'readableFields')).toBe(false);
        expect(hasFieldSet({ enabled: true, readableFields: ['Name'] }, 'readableFields')).toBe(true);
    });
});

describe('dropping a permission whose actions are all off', () => {
    it('drops it when nothing else is on it', () => {
        expect(isEmptyPermission(emptyPermission('record'))).toBe(true);
    });

    it('keeps it while it holds a transition rule, which the grid does not show', () => {
        expect(isEmptyPermission({ ...emptyPermission('invoice'), transitions: { approve: { enabled: true } } })).toBe(
            false,
        );
    });
});
