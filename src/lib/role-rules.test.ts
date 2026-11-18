import { describe, it, expect } from 'vitest';
import { emptyPermission } from '@/types/rbac';
import {
    conditionPreset,
    conditionProblem,
    crudSummary,
    effectiveFields,
    hasFieldSet,
    isEmptyPermission,
    presetRow,
    readConditions,
    toggleFieldInSet,
    writeConditions,
} from './role-rules';

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

describe('crudSummary', () => {
    it('writes a letter for each granted action and a dot for each missing one', () => {
        const none = emptyPermission('record');
        expect(crudSummary(none)).toBe('....');
        expect(crudSummary({ ...none, create: { enabled: true }, read: { enabled: true }, delete: { enabled: true } })).toBe('CR.D');
        expect(crudSummary({ ...none, update: { enabled: true } })).toBe('..U.');
        expect(crudSummary(undefined)).toBe('....');
    });
});

describe('effectiveFields', () => {
    const schema = ['Name', 'Grade'];

    it('is every field of the type when the rule holds no set, whether absent, null or empty', () => {
        expect(effectiveFields({ enabled: true }, 'readableFields', schema)).toEqual(['Name', 'Grade']);
        expect(effectiveFields({ enabled: true, readableFields: null }, 'readableFields', schema)).toEqual(['Name', 'Grade']);
        expect(effectiveFields({ enabled: true, readableFields: [] }, 'readableFields', schema)).toEqual(['Name', 'Grade']);
    });

    it('is the stored set, including a field the type no longer has', () => {
        expect(effectiveFields({ enabled: true, writableFields: ['Grade', 'Gone'] }, 'writableFields', schema)).toEqual([
            'Grade',
            'Gone',
        ]);
    });
});

describe('toggleFieldInSet', () => {
    const schema = ['Name', 'Grade', 'Seats'];

    it('narrows a rule with no set from every field', () => {
        expect(toggleFieldInSet({ enabled: true }, 'readableFields', schema, 'Grade', false)).toEqual(['Name', 'Seats']);
    });

    it('adds a field to a set', () => {
        expect(toggleFieldInSet({ enabled: true, readableFields: ['Name'] }, 'readableFields', schema, 'Grade', true)).toEqual([
            'Name',
            'Grade',
        ]);
    });

    it('stores an empty list when the set holds every field, which is how the API removes a limit', () => {
        expect(toggleFieldInSet({ enabled: true, readableFields: ['Name', 'Grade'] }, 'readableFields', schema, 'Seats', true)).toEqual([]);
    });

    it('keeps the list when it holds every field and a field the type no longer has', () => {
        const rule = { enabled: true, readableFields: ['Name', 'Grade', 'Gone'] };
        expect(toggleFieldInSet(rule, 'readableFields', schema, 'Seats', true)).toEqual(['Name', 'Grade', 'Gone', 'Seats']);
    });

    it('stores an empty list when the last field is removed', () => {
        expect(toggleFieldInSet({ enabled: true, writableFields: ['Name'] }, 'writableFields', schema, 'Name', false)).toEqual([]);
    });
});

describe('conditionPreset', () => {
    const row = (key: string, value: string, operator: '_eq' | '_ne' = '_eq') => ({ key, operator, value });
    const draft = (rows: ReturnType<typeof row>[], kept: Record<string, unknown> = {}) => ({ rows, kept });

    it('is any entry with no condition', () => {
        expect(conditionPreset(draft([]))).toBe('any');
    });

    it('reads $createdBy in any case after the dollar as only their own', () => {
        expect(conditionPreset(draft([row('$createdBy', '$CURRENT_USER')]))).toBe('own');
        expect(conditionPreset(draft([row('$CreatedBy', '$CURRENT_USER')]))).toBe('own');
        expect(conditionPreset(draft([row('Owner', '$CURRENT_USER')]))).toBe('custom');
        expect(conditionPreset(draft([row('AssignedTo', '$CURRENT_USER')]))).toBe('custom');
    });

    it('leaves a plain CreatedBy key custom, since without the dollar it names a content field', () => {
        expect(conditionPreset(draft([row('CreatedBy', '$CURRENT_USER')]))).toBe('custom');
    });

    it('reads the department value as only their department and any other attribute as custom', () => {
        expect(conditionPreset(draft([row('Owner', '$CURRENT_USER.department')]))).toBe('department');
        expect(conditionPreset(draft([row('Owner', '$CURRENT_USER.team')]))).toBe('custom');
    });

    it('is custom for a second row, another operator or a condition the screen keeps as stored', () => {
        expect(conditionPreset(draft([row('A', '$CURRENT_USER'), row('B', '$CURRENT_USER')]))).toBe('custom');
        expect(conditionPreset(draft([row('A', '$CURRENT_USER', '_ne')]))).toBe('custom');
        expect(conditionPreset(draft([row('A', '$CURRENT_USER')], { Seats: { _eq: 4 } }))).toBe('custom');
        expect(conditionPreset(draft([], { Seats: { _eq: 4 } }))).toBe('custom');
    });
});

describe('presetRow', () => {
    it('writes an _eq row for each preset', () => {
        expect(presetRow('own', '$createdBy')).toEqual({ key: '$createdBy', operator: '_eq', value: '$CURRENT_USER' });
        expect(presetRow('department', 'Owner')).toEqual({ key: 'Owner', operator: '_eq', value: '$CURRENT_USER.department' });
    });
});
