import { moneyScale } from 'barako-content-form';
import { withoutTokenFields } from '@/lib/token-fields';
import {
    resolveFieldType,
    type ContentTypeDefinition,
    type FieldDefinition,
    type LinesDefinition,
} from '@/types/schema';

/** The most lines one create takes. Mirrors LineTotals.MaxLines in barakoCMS. */
export const MAX_LINES = 200;

/** The admin contract that brought `PUT /api/content-types/{name}/lines`, barakoCMS 5.3.0. */
export const LINES_CONTRACT = 12;

/** Whether two names are the same field or type. The API finds both without regard to case. */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
    return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function findType(
    types: readonly ContentTypeDefinition[],
    name: string | null | undefined,
): ContentTypeDefinition | undefined {
    return types.find((t) => sameName(t.name, name));
}

/** The type that has this one as its line type, if any. */
export function headerOf(
    types: readonly ContentTypeDefinition[],
    name: string,
): ContentTypeDefinition | undefined {
    return types.find((t) => t.lines && sameName(t.lines.contentType, name));
}

/**
 * The types that may be picked as the line type of `self`: not itself, with no lines of their own,
 * and not already the line type of another type. The type `self` already points at stays offered,
 * so the current choice is not dropped from its own list.
 */
export function lineTypeChoices(
    types: readonly ContentTypeDefinition[],
    self: ContentTypeDefinition,
): ContentTypeDefinition[] {
    return types.filter((t) => {
        if (sameName(t.name, self.name)) return false;
        if (t.lines) return false;
        const header = headerOf(types, t.name);
        return !header || sameName(header.name, self.name);
    });
}

/**
 * The options with the stored choice among them. A stored field that no longer passes the filter
 * is still what a save sends, so it is listed (by its stored spelling) for the person to see and
 * change, rather than leaving the select blank over a value that goes out.
 */
export function withStored(
    options: readonly FieldDefinition[],
    fields: readonly FieldDefinition[] | undefined,
    stored: string,
): FieldDefinition[] {
    if (!stored || options.some((f) => f.name === stored)) return [...options];
    const known = fields?.find((f) => sameName(f.name, stored));
    return [...options, { ...(known ?? { displayName: stored, type: 'string', isRequired: false }), name: stored } as FieldDefinition];
}

/** The line type's single reference fields that point at `header`. */
export function parentFieldChoices(lineType: ContentTypeDefinition, header: string): FieldDefinition[] {
    return lineType.fields.filter(
        (f) => resolveFieldType(f.type) === 'reference' && !f.multiple && sameName(f.referenceType, header),
    );
}

const NUMBER_KINDS = new Set(['int', 'decimal', 'money']);

/** A number kind the server accepts as a total or a line amount. A rollup is refused, computed is not. */
export function isSummable(field: FieldDefinition): boolean {
    const kind = resolveFieldType(field.type);
    return !!kind && NUMBER_KINDS.has(kind) && !field.rollup;
}

/** The fields of a line that are typed in: not the parent field, not computed, not rolled up. */
export function lineColumns(lineType: ContentTypeDefinition, parentField: string): FieldDefinition[] {
    return lineType.fields.filter((f) => !sameName(f.name, parentField) && !f.computed && !f.rollup);
}

/**
 * The lines as they are sent. Only the columns survive, whatever a row object holds, because the
 * server sets the parent field and works out computed and rolled up fields, and a token is never
 * sent from a screen.
 */
export function rowsToSend(
    lineType: ContentTypeDefinition,
    parentField: string,
    rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
    const columns = lineColumns(lineType, parentField);
    return rows.map((row) => {
        const kept = Object.fromEntries(
            Object.entries(row).filter(([key]) => columns.some((c) => sameName(c.name, key))),
        );
        return withoutTokenFields(lineType.fields, kept);
    });
}

/** The part of a create request that carries the lines. Nothing at all for an empty grid, not an empty list. */
export function linesPayload(
    lineType: ContentTypeDefinition,
    parentField: string,
    rows: readonly Record<string, unknown>[],
): { lines?: Record<string, unknown>[] } {
    return rows.length === 0 ? {} : { lines: rowsToSend(lineType, parentField, rows) };
}

/** How many digits follow the decimal point in a number as it is written, exponent form included. */
export function decimalPlaces(n: number): number {
    const match = /^-?\d+(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(n));
    if (!match) return 0;
    return Math.max(0, (match[1]?.length ?? 0) - Number(match[2] ?? 0));
}

/** `n` as a whole number of units of 10^-scale. Scaled in the text, so 1.005 at 3 is 1005 exactly. */
function scaled(n: number, scale: number): number {
    const text = String(n);
    if (/e/i.test(text)) return Math.round(n * 10 ** scale);
    return Math.round(Number(`${text}e${scale}`));
}

/** Whole units of 10^-scale written as a plain decimal, with no float in between. */
function scaledText(units: number, scale: number): string {
    const sign = units < 0 ? '-' : '';
    const digits = String(Math.abs(units)).padStart(scale + 1, '0');
    if (scale === 0) return sign + digits;
    return `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

export interface Sum {
    /** The sum in whole units of 10^-scale. */
    units: number;
    scale: number;
    text: string;
}

/**
 * Adds amounts as whole numbers of the smallest unit in play, never as floats, so 0.1 and 0.2 add
 * up to 0.3. The scale is the money field's own when it has one, and at least the most decimal
 * places any amount carries.
 */
export function sumAmounts(amounts: readonly number[], declaredScale?: number): Sum {
    const scale = Math.max(declaredScale ?? 0, ...amounts.map(decimalPlaces));
    const units = amounts.reduce((sum, n) => sum + scaled(n, scale), 0);
    return { units, scale, text: scaledText(units, scale) };
}

/** Whether a total is a different amount from a sum, compared in whole units of the finer scale. */
export function totalDiffers(sum: Sum, total: number): boolean {
    const scale = Math.max(sum.scale, decimalPlaces(total));
    return sum.units * 10 ** (scale - sum.scale) !== scaled(total, scale);
}

/** The scale a line amount field declares: a money field with a currency, or its own scale. */
export function declaredScale(field: FieldDefinition | undefined): number | undefined {
    if (!field || resolveFieldType(field.type) !== 'money') return undefined;
    return moneyScale(field);
}

/** The numbers in one column of the rows: an amount left empty or not a number adds nothing. */
export function columnAmounts(rows: readonly Record<string, unknown>[], field: string): number[] {
    return rows.flatMap((row) => {
        const key = Object.keys(row).find((k) => sameName(k, field));
        const value = key === undefined ? undefined : row[key];
        return typeof value === 'number' && Number.isFinite(value) ? [value] : [];
    });
}

/** What a total rule says about a refused line count and total, split off the other refusals. */
export function splitLineRefusals(errors: readonly string[]): { grid: string[]; rest: string[] } {
    const grid: string[] = [];
    const rest: string[] = [];
    for (const error of errors) {
        if (linePosition(error) !== null || /lines add up to/i.test(error)) grid.push(error);
        else rest.push(error);
    }
    return { grid, rest };
}

/** The 1-based position a refusal names ("Line 2: ..."), or null when it names none. */
export function linePosition(error: string): number | null {
    const match = /^Line (\d+):/i.exec(error);
    return match ? Number(match[1]) : null;
}

/** Whether the lines carry a total rule: a total field and the line amount field it is checked against. */
export function hasTotal(lines: LinesDefinition | null | undefined): lines is LinesDefinition & {
    totalField: string;
    lineAmountField: string;
} {
    return !!lines?.totalField && !!lines.lineAmountField;
}
