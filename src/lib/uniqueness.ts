import {
    CREATED_BY_FIELD,
    SensitivityLevel,
    resolveFieldType,
    type FieldDefinition,
    type UniquenessRule,
} from '@/types/schema';

/**
 * What a uniqueness rule may compare, copied from the API's rules (docs/uniqueness-rules.md): a
 * Public field holding one value of these types, or the entry's creator. Dates and times are left
 * out on purpose by the API, since one instant has many spellings.
 */
const COMPARABLE = new Set(['string', 'text', 'int', 'decimal', 'money', 'bool', 'email', 'url', 'slug', 'uuid', 'reference', 'choice']);

export const MAX_RULES = 5;
export const MAX_RULE_FIELDS = 5;

export function comparableFields(fields: readonly FieldDefinition[]): FieldDefinition[] {
    return fields.filter((field) => {
        const type = resolveFieldType(field.type);
        if (!type || !COMPARABLE.has(type)) return false;
        if (field.multiple) return false;
        return !field.sensitivity || field.sensitivity === SensitivityLevel.Public;
    });
}

/** What to call a name a rule compares: the field's display name, or "Created by". */
export function ruleFieldLabel(name: string, fields: readonly FieldDefinition[]): string {
    if (name === CREATED_BY_FIELD) return 'Created by';
    return fields.find((f) => f.name.toLowerCase() === name.toLowerCase())?.displayName ?? name;
}

/** Why one rule would be refused, or null. The API checks again and its message is shown. */
export function ruleProblem(rule: UniquenessRule, others: readonly UniquenessRule[]): string | null {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(rule.name) || rule.name.length > 64) {
        return 'Name the rule in PascalCase, letters and digits, such as OneEntryPerEmail.';
    }
    if (others.some((o) => o.name.toLowerCase() === rule.name.toLowerCase())) {
        return 'Two rules cannot share a name.';
    }
    if (rule.fields.length === 0) return 'Pick at least one field.';
    if (rule.fields.length > MAX_RULE_FIELDS) return `A rule compares at most ${MAX_RULE_FIELDS} fields.`;
    return null;
}

/** The rules as they are sent: a blank state is left out rather than sent empty. */
export function rulesToSend(rules: readonly UniquenessRule[]): UniquenessRule[] {
    return rules.map((r) => (r.whenState ? { name: r.name, fields: r.fields, whenState: r.whenState } : { name: r.name, fields: r.fields }));
}
