import type { ContentTypePermission, PermissionAction, PermissionRule } from '@/types/rbac';

/** The operators a condition that follows a reference accepts (`ReferenceConditions.Operators`). */
export const CONDITION_OPERATORS = ['_eq', '_ne', '_in', '_nin'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
    _eq: 'is',
    _ne: 'is not',
    _in: 'is one of',
    _nin: 'is none of',
};

/**
 * One condition the editor can show: a key, one operator and a text value. A list operator's value
 * is typed as text separated by commas.
 */
export interface ConditionRow {
    key: string;
    operator: ConditionOperator;
    value: string;
}

/**
 * A rule's conditions split into what the editor shows and what it keeps as stored.
 *
 * A condition with more than one operator, an operator outside the four, or a value that is not text
 * is kept whole and sent back unchanged. The API replaces a role's permissions with what a save
 * sends, so a condition the editor cannot draw is still sent, never dropped.
 */
export function readConditions(conditions: PermissionRule['conditions']): {
    rows: ConditionRow[];
    kept: Record<string, unknown>;
} {
    const rows: ConditionRow[] = [];
    const kept: Record<string, unknown> = {};

    for (const [key, tested] of Object.entries(conditions ?? {})) {
        const row = asRow(key, tested);
        if (row) rows.push(row);
        else kept[key] = tested;
    }

    return { rows, kept };
}

function asRow(key: string, tested: unknown): ConditionRow | null {
    if (!tested || typeof tested !== 'object' || Array.isArray(tested)) return null;
    const entries = Object.entries(tested as Record<string, unknown>);
    if (entries.length !== 1) return null;

    const [operator, value] = entries[0];
    if (!(CONDITION_OPERATORS as readonly string[]).includes(operator)) return null;
    const op = operator as ConditionOperator;

    if (op === '_eq' || op === '_ne') {
        return typeof value === 'string' ? { key, operator: op, value } : null;
    }
    if (Array.isArray(value) && value.every((v) => typeof v === 'string' && !v.includes(','))) {
        return { key, operator: op, value: value.join(', ') };
    }
    return null;
}

/** The items of a list operator's typed value. */
export function listItems(value: string): string[] {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '');
}

/**
 * The conditions to send: the kept ones as stored, then each row. Null when there are none, which
 * is what a rule with no condition holds.
 */
export function writeConditions(
    rows: readonly ConditionRow[],
    kept: Record<string, unknown>,
): Record<string, unknown> | null {
    const out: Record<string, unknown> = { ...kept };
    for (const row of rows) {
        const key = row.key.trim();
        if (!key) continue;
        out[key] =
            row.operator === '_in' || row.operator === '_nin'
                ? { [row.operator]: listItems(row.value) }
                : { [row.operator]: row.value };
    }
    return Object.keys(out).length > 0 ? out : null;
}

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * Why the API would refuse a row, mirroring `ReferenceConditionRules.ShapeErrors`. A copy that can
 * drift; the server still decides, and its answer is shown when it refuses.
 *
 * Only a key holding a dot follows a reference, and only that key is checked for shape. A plain key
 * such as `CreatedBy` compares a field of the entry itself.
 */
export function conditionProblem(row: ConditionRow): string | null {
    const key = row.key.trim();
    if (!key) return 'A condition needs a field.';

    if (key.includes('.') && !key.startsWith('$')) {
        const parts = key.split('.');
        if (parts.length !== 2 || !parts.every((part) => NAME.test(part))) {
            return `'${key}' is not Reference.Field: two names, each starting with a letter and holding letters, digits and underscores. One reference is followed, not two.`;
        }
    }

    if (row.operator === '_in' || row.operator === '_nin') {
        if (listItems(row.value).length === 0) return `'${key}' needs at least one value.`;
    }
    return null;
}

/** The rules that take a field set, and which set. */
export const FIELD_SET_RULES: { action: PermissionAction; set: 'readableFields' | 'writableFields' }[] = [
    { action: 'read', set: 'readableFields' },
    { action: 'create', set: 'writableFields' },
    { action: 'update', set: 'writableFields' },
];

/** The rules a condition is evaluated on. A Create rule has no stored entry to compare. */
export const CONDITION_RULES: PermissionAction[] = ['read', 'update', 'delete'];

/**
 * Whether a rule holds a field set. Absent and null both mean every field, and so does an empty list,
 * which the API stores as no set.
 */
export function hasFieldSet(rule: PermissionRule, set: 'readableFields' | 'writableFields'): boolean {
    const names = rule[set];
    return Array.isArray(names) && names.length > 0;
}

/**
 * Whether turning every action off may drop this permission from the role. Not when it still holds
 * a transition rule, which this editor does not show: dropping the permission would drop that too.
 */
export function isEmptyPermission(permission: ContentTypePermission): boolean {
    const crudOff = (['create', 'read', 'update', 'delete'] as const).every((a) => !permission[a]?.enabled);
    const transitions = permission.transitions ? Object.keys(permission.transitions).length : 0;
    return crudOff && transitions === 0;
}
