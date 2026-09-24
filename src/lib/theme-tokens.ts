/**
 * A site's own named values (`Tokens`) and tones (`Tones`), as barakoPress reads them from the site
 * settings (barakoPress#125, `src/theme.ts`).
 *
 * The patterns are the engine's, copied so the form refuses what the engine would drop. The engine
 * stays the authority: it checks every value again when it reads the settings.
 */

import type { BlockField, BlockSchema } from '@/lib/blocks';
import { COLOR_SLOTS } from '@/lib/site-settings';

export const TOKENS_FIELD = 'Tokens';
export const TONES_FIELD = 'Tones';

/** The tones every site has. A site's own tone may not take one of these names. */
export const BUILT_IN_TONES = ['page', 'surface', 'accent', 'inverse', 'gradient', 'wash'] as const;

/** The engine's role names for the slots named after barakocms.com, which hold the same colour. */
export const COLOR_ROLE_ALIASES: Readonly<Record<string, string>> = {
    accentBorderStrong: 'accentTintBorderStrong',
    inverse: 'darkPanel',
    inverseChrome: 'darkPanelChrome',
    inverseInk: 'darkPanelInk',
    inverseAccent: 'darkPanelAccent',
    code: 'codeGreen',
};

/**
 * Every colour name the engine's theme holds: the slots, and their role names. A tone may name any
 * of them, set or not, since the engine has a default for each.
 */
export const THEME_COLOR_NAMES: readonly string[] = [...COLOR_SLOTS, ...Object.keys(COLOR_ROLE_ALIASES)];

export const COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab)\([0-9.,%\s/+-]{1,60}\)|[a-z]{3,30})$/i;
const LENGTH_VALUE = '(?:0|\\d{1,4}(?:\\.\\d{1,3})?(?:px|rem|em|ch|%|vw|vh))';
export const FLUID_LENGTH = new RegExp(
    `^(?:${LENGTH_VALUE}|clamp\\(\\s*${LENGTH_VALUE}\\s*,\\s*${LENGTH_VALUE}\\s*,\\s*${LENGTH_VALUE}\\s*\\))$`,
);
const FAMILY = `(?:'[A-Za-z0-9 -]{1,60}'|"[A-Za-z0-9 -]{1,60}"|[A-Za-z][A-Za-z0-9-]{0,40}(?: [A-Za-z0-9-]{1,40}){0,4})`;
export const FONT_STACK = new RegExp(`^${FAMILY}(?:\\s*,\\s*${FAMILY}){0,11}$`);

export const TOKEN_NAME = /^[A-Za-z][A-Za-z0-9-]{0,39}$/;
export const TONE_NAME = /^[a-z][a-z0-9-]{0,30}$/;
export const MAX_TOKENS = 200;
export const MAX_TONES = 40;
const MAX_TOKEN_VALUE = 300;

export type TokenKind = 'colour' | 'length' | 'font';

export interface TokenRow {
    name: string;
    value: string;
}

export interface ToneRow {
    name: string;
    ink: string;
    bg: string;
    edge: string;
}

export const TONE_PARTS = ['ink', 'bg', 'edge'] as const;
export type TonePart = (typeof TONE_PARTS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * What a token value is, or null when the engine would drop it.
 *
 * A bare word such as `serif` passes both as a colour name and as a font stack. It is called a font
 * here because that is the likelier meaning, and the engine accepts it either way.
 */
export function tokenKind(raw: string): TokenKind | null {
    const value = raw.trim();
    if (value === '' || value.length > MAX_TOKEN_VALUE) return null;
    if (FLUID_LENGTH.test(value)) return 'length';
    if (COLOR.test(value) && (value.startsWith('#') || value.includes('('))) return 'colour';
    if (FONT_STACK.test(value)) return 'font';
    return COLOR.test(value) ? 'colour' : null;
}

/** The stored map as rows, in the order it was saved. Null for a value of another shape. */
export function readTokens(value: unknown): TokenRow[] | null {
    if (value === undefined || value === null) return [];
    if (!isRecord(value)) return null;
    const rows = Object.entries(value);
    return rows.every(([, v]) => typeof v === 'string') ? rows.map(([name, v]) => ({ name, value: v as string })) : null;
}

/** Back to the stored map. A row with no name, or one whose name is taken above it, is left out. */
export function writeTokens(rows: readonly TokenRow[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const { name, value } of rows) {
        const key = name.trim();
        if (key === '' || Object.hasOwn(out, key)) continue;
        out[key] = value.trim();
    }
    return out;
}

export function tokenNameProblem(name: string): string | null {
    return TOKEN_NAME.test(name.trim())
        ? null
        : 'A name is a letter, then letters, digits and hyphens, up to 40 characters.';
}

export function tokenValueProblem(value: string): string | null {
    if (value.trim() === '') return 'Needs a value.';
    return tokenKind(value) === null
        ? 'Not a colour, a length (or a clamp of three) or a font stack. The site drops it.'
        : null;
}

/** The names a later row repeats, by index, so the form can say which rows are not saved. */
export function repeatedNames(names: readonly string[], fold: (name: string) => string = (n) => n.trim()): Set<number> {
    const seen = new Set<string>();
    const repeated = new Set<number>();
    names.forEach((name, index) => {
        const key = fold(name);
        if (key === '') return;
        if (seen.has(key)) repeated.add(index);
        else seen.add(key);
    });
    return repeated;
}

/** The stored map as rows. Null for a value of another shape. */
export function readTones(value: unknown): ToneRow[] | null {
    if (value === undefined || value === null) return [];
    if (!isRecord(value)) return null;
    const rows: ToneRow[] = [];
    for (const [name, spec] of Object.entries(value)) {
        if (!isRecord(spec) || !Object.keys(spec).every((k) => (TONE_PARTS as readonly string[]).includes(k))) return null;
        const { ink = '', bg = '', edge = '' } = spec;
        if (typeof ink !== 'string' || typeof bg !== 'string' || typeof edge !== 'string') return null;
        rows.push({ name, ink, bg, edge });
    }
    return rows;
}

export function writeTones(rows: readonly ToneRow[]): Record<string, { ink: string; bg: string; edge: string }> {
    const out: Record<string, { ink: string; bg: string; edge: string }> = {};
    for (const { name, ink, bg, edge } of rows) {
        const key = name.trim();
        if (key === '' || Object.hasOwn(out, key)) continue;
        out[key] = { ink: ink.trim(), bg: bg.trim(), edge: edge.trim() };
    }
    return out;
}

export function toneNameProblem(name: string): string | null {
    const value = name.trim();
    if ((BUILT_IN_TONES as readonly string[]).includes(value)) {
        return `${value} is a built-in tone, which follows the colours. Pick another name.`;
    }
    return TONE_NAME.test(value)
        ? null
        : 'A name is a lower case letter, then lower case letters, digits and hyphens, up to 31 characters.';
}

/**
 * Why a tone colour would not resolve, or null. The engine looks a name up as a token first, then as
 * a colour slot, then reads it as a colour written out, and a token that holds no colour stops there.
 */
export function toneColourProblem(ref: string, tokens: Readonly<Record<string, string>>): string | null {
    const value = ref.trim();
    if (value === '') return 'Needs a colour, a token or a colour slot.';
    if (Object.hasOwn(tokens, value)) {
        return COLOR.test(tokens[value]) ? null : `The token ${value} does not hold a colour.`;
    }
    if (THEME_COLOR_NAMES.includes(value) || COLOR.test(value)) return null;
    return `${value} is not a token, a colour slot or a colour.`;
}

/**
 * The colour a tone part draws with here, for the preview chip. A slot the site leaves unset has no
 * colour in this console, so it falls to `fallback`, which the caller supplies.
 */
export function resolveToneColour(
    ref: string,
    tokens: Readonly<Record<string, string>>,
    colors: Readonly<Record<string, string>>,
    fallback: (slot: string) => string | undefined,
): string | undefined {
    const value = ref.trim();
    if (toneColourProblem(value, tokens) !== null) return undefined;
    if (Object.hasOwn(tokens, value)) return tokens[value].trim();
    if (THEME_COLOR_NAMES.includes(value)) {
        const slot = COLOR_ROLE_ALIASES[value] ?? value;
        return colors[value] || colors[slot] || fallback(slot);
    }
    return value;
}

/** Only the tokens the engine keeps, for looking names up against. */
export function validTokens(value: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    for (const { name, value: v } of readTokens(value) ?? []) {
        if (tokenNameProblem(name) === null && tokenValueProblem(v) === null) out[name] = v.trim();
    }
    return out;
}

/** The names of the tones a block may store, in the order they were saved. */
export function toneNames(value: unknown): string[] {
    return (readTones(value) ?? []).map((t) => t.name).filter((name) => toneNameProblem(name) === null);
}

/**
 * Why a save of these settings would store something the engine drops, or null. Only the fields
 * this screen edits, and only when their stored shape is one the form can read.
 */
export function tokensAndTonesProblem(values: Record<string, unknown>): string | null {
    const tokens = readTokens(values[TOKENS_FIELD]);
    if (tokens) {
        if (tokens.length > MAX_TOKENS) return `The site reads the first ${MAX_TOKENS} tokens. Remove some to save.`;
        const bad = tokens.filter((t) => tokenNameProblem(t.name) || tokenValueProblem(t.value)).length;
        if (bad > 0) return `${bad === 1 ? 'A token has' : `${bad} tokens have`} a problem the site would drop. Fix it to save.`;
    }
    const tones = readTones(values[TONES_FIELD]);
    if (tones) {
        if (tones.length > MAX_TONES) return `The site reads the first ${MAX_TONES} tones. Remove some to save.`;
        const named = validTokens(values[TOKENS_FIELD]);
        const bad = tones.filter(
            (t) => toneNameProblem(t.name) || TONE_PARTS.some((part) => toneColourProblem(t[part], named)),
        ).length;
        if (bad > 0) return `${bad === 1 ? 'A tone has' : `${bad} tones have`} a problem the site would drop. Fix it to save.`;
    }
    return null;
}

/**
 * A tone field, the way barakoPress finds one: a select offering every built-in tone. Read off the
 * options rather than the name, because a preset may call its tone field anything.
 */
function isToneField(field: BlockField): boolean {
    return field.kind === 'select' && BUILT_IN_TONES.every((tone) => field.options?.includes(tone) === true);
}

function widenFields(fields: readonly BlockField[], names: readonly string[]): BlockField[] {
    return fields.map((field) => {
        let next = field;
        if (isToneField(field)) {
            const missing = names.filter((n) => !field.options!.includes(n));
            if (missing.length > 0) next = { ...next, options: [...field.options!, ...missing] };
        }
        if (field.fields) next = { ...next, fields: widenFields(field.fields, names) };
        if (field.item?.fields) next = { ...next, item: { ...field.item, fields: widenFields(field.item.fields, names) } };
        return next;
    });
}

/**
 * The schema with the tenant's own tones offered by every tone field, after the built-in six.
 *
 * The site does this too when it knows the tenant, but the console reads the schema without saying
 * which tenant it is editing, so it adds them from the settings it has already read.
 */
export function withTones(schema: BlockSchema, names: readonly string[]): BlockSchema {
    if (names.length === 0) return schema;
    return { ...schema, blocks: schema.blocks.map((b) => ({ ...b, fields: widenFields(b.fields, names) })) };
}
