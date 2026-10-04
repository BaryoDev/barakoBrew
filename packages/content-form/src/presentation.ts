import type { FieldDefinition } from './definition';

/** One run of fields on an edit screen, under the section they name, or under none. */
export interface FieldGroup {
    section: string | null;
    fields: FieldDefinition[];
}

/**
 * The fields in the groups an edit screen draws them in.
 *
 * Sections appear in the order of the first field that names each, compared exactly, case
 * included, and fields keep the type's own order inside one. That is the API's rule for `section`.
 * Fields in no section stay where the first of them sits, as one group of their own.
 */
export function groupBySection(fields: readonly FieldDefinition[]): FieldGroup[] {
    const groups: FieldGroup[] = [];
    const bySection = new Map<string | null, FieldGroup>();
    for (const field of fields) {
        const section = field.section ? field.section : null;
        let group = bySection.get(section);
        if (!group) {
            group = { section, fields: [] };
            bySection.set(section, group);
            groups.push(group);
        }
        group.fields.push(field);
    }
    return groups;
}

/**
 * The decimal places an amount in a money field may carry, or undefined for a plain number.
 *
 * The declared `scale` when there is one. Otherwise the currency's own minor unit, which the API
 * takes from ISO 4217 and the browser's Intl data knows too: 2 for USD, 0 for JPY, 3 for KWD. A code
 * the browser does not know gives undefined, and the API still decides on save.
 */
export function moneyScale(field: Pick<FieldDefinition, 'currency' | 'scale'>): number | undefined {
    if (!field.currency) return undefined;
    if (typeof field.scale === 'number') return field.scale;
    try {
        return new Intl.NumberFormat('en', { style: 'currency', currency: field.currency }).resolvedOptions()
            .maximumFractionDigits;
    } catch {
        return undefined;
    }
}

/** The step a number input takes for that many decimal places. */
export function stepFor(scale: number | undefined): string {
    if (scale === undefined) return 'any';
    return scale === 0 ? '1' : `0.${'0'.repeat(scale - 1)}1`;
}
