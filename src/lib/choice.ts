import { resolveFieldType, type FieldDefinition, type FieldOption } from '@/types/schema';

/** Limits the API enforces on a choice, from ContentTypeValidatorService. */
export const MAX_CHOICE_OPTIONS = 200;
export const MAX_CHOICE_VALUE_LENGTH = 100;
export const MAX_CHOICE_LABEL_LENGTH = 200;

/** A single choice with this many options or fewer is a radio group; more is a select. */
export const RADIO_GROUP_LIMIT = 5;

export function isChoiceField(field: Pick<FieldDefinition, 'type'>): boolean {
    return resolveFieldType(field.type) === 'choice';
}

/** What an editor sees for an option. The API lets a label be empty, and a consumer then shows the value. */
export function optionLabel(option: FieldOption): string {
    return option.label || option.value;
}

export interface OptionIssues {
    /** A problem with the list as a whole, or null. */
    list: string | null;
    /** One entry per option, null when that option is fine. */
    rows: (string | null)[];
}

/**
 * What the API would refuse about this list of options, found before the request.
 *
 * A copy of ContentTypeValidatorService.ChoiceErrors. The server still decides; this only puts the
 * message next to the row that caused it.
 */
export function optionIssues(options: FieldOption[]): OptionIssues {
    let list: string | null = null;
    if (options.length === 0) list = 'Add at least one option.';
    else if (options.length > MAX_CHOICE_OPTIONS) {
        list = `A choice holds at most ${MAX_CHOICE_OPTIONS} options. A longer list belongs in its own content type.`;
    }

    // Ignoring case, the way the API compares them, although entries are matched exactly.
    const firstByKey = new Map<string, string>();

    const rows = options.map((option) => {
        const value = option.value ?? '';
        if (value.trim() === '') return 'Give this option a value.';

        const key = value.toLowerCase();
        const first = firstByKey.get(key);
        if (first === undefined) firstByKey.set(key, value);

        if (value !== value.trim()) return 'Remove the space at the start or end of the value.';
        if (value.length > MAX_CHOICE_VALUE_LENGTH) {
            return `A value is at most ${MAX_CHOICE_VALUE_LENGTH} characters.`;
        }
        if ((option.label ?? '').length > MAX_CHOICE_LABEL_LENGTH) {
            return `A label is at most ${MAX_CHOICE_LABEL_LENGTH} characters.`;
        }
        if (first !== undefined) {
            return `"${value}" differs from "${first}" only in case. Values have to differ by more than case.`;
        }
        return null;
    });

    return { list, rows };
}

export function hasOptionIssues(issues: OptionIssues): boolean {
    return issues.list !== null || issues.rows.some((row) => row !== null);
}

/** The values an entry holds for a choice field, whichever shape arrived. */
export function storedChoiceValues(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
    return typeof value === 'string' && value !== '' ? [value] : [];
}

/** Stored values the field no longer offers. Matched exactly, case included, as the API matches. */
export function notOfferedValues(field: FieldDefinition, value: unknown): string[] {
    const offered = new Set((field.options ?? []).map((option) => option.value));
    return storedChoiceValues(value).filter((v) => !offered.has(v));
}

export function notOfferedMessage(values: string[]): string | undefined {
    if (values.length === 0) return undefined;
    const quoted = values.map((v) => `"${v}"`).join(', ');
    return values.length === 1
        ? `${quoted} is not offered any more. Pick another value before saving.`
        : `${quoted} are not offered any more. Pick other values before saving.`;
}

/**
 * The choice fields holding a value the field no longer offers, with the message for each.
 *
 * The API refuses such an entry on save, so the editor stops the save first and says which field.
 */
export function choiceProblems(
    fields: FieldDefinition[],
    values: Record<string, unknown>,
): Record<string, string> {
    const problems: Record<string, string> = {};
    for (const field of fields) {
        if (!isChoiceField(field)) continue;
        const message = notOfferedMessage(notOfferedValues(field, values[field.name]));
        if (message) problems[field.name] = message;
    }
    return problems;
}
