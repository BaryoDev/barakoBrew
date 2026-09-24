/**
 * Style recipes (barakoPress#131): a named look a block wears with `recipe: "<name>"`, stored in the
 * site settings as `StyleRecipes`.
 *
 * The property list and the value rules are the engine's (`src/recipes.ts`), copied so the form
 * refuses what the engine would drop. The engine checks everything again when it reads the settings
 * and again when a block draws, so it stays the authority. The values reach a style attribute, which
 * is why the rules are narrow: no `;`, `:`, braces, angle brackets, backslash, `!`, `@` or comment,
 * quotes only around a plain family name, and a function only from a fixed list.
 */

import type { CSSProperties } from 'react';
import { THEME_COLOR_NAMES, type SiteTypeFields } from '@/lib/theme-tokens';

export const RECIPES_FIELD = 'StyleRecipes';

export const RECIPE_PROPERTY_GROUPS = {
    box: [
        'display',
        'position',
        'box-sizing',
        'width',
        'min-width',
        'max-width',
        'height',
        'min-height',
        'max-height',
        'aspect-ratio',
        'overflow',
        'overflow-x',
        'overflow-y',
        'vertical-align',
        'opacity',
    ],
    spacing: [
        'margin',
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
        'margin-block',
        'margin-inline',
        'padding',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'padding-block',
        'padding-inline',
        'gap',
        'row-gap',
        'column-gap',
    ],
    typography: [
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'font-variant-numeric',
        'line-height',
        'letter-spacing',
        'text-align',
        'text-transform',
        'text-decoration',
        'text-underline-offset',
        'text-wrap',
        'text-overflow',
        'white-space',
        'overflow-wrap',
        'word-break',
    ],
    colour: ['color', 'background', 'background-color'],
    border: [
        'border',
        'border-top',
        'border-right',
        'border-bottom',
        'border-left',
        'border-color',
        'border-style',
        'border-width',
    ],
    radius: ['border-radius'],
    shadow: ['box-shadow', 'text-shadow'],
    grid: [
        'grid-template-columns',
        'grid-template-rows',
        'grid-auto-flow',
        'grid-auto-rows',
        'grid-column',
        'grid-row',
        'justify-items',
        'place-items',
        'place-content',
    ],
    flex: [
        'flex',
        'flex-direction',
        'flex-wrap',
        'flex-grow',
        'flex-shrink',
        'flex-basis',
        'align-items',
        'align-content',
        'align-self',
        'justify-content',
        'justify-self',
        'order',
    ],
    engine: [
        '--bp-ink',
        '--bp-ink-soft',
        '--bp-muted',
        '--bp-hairline',
        '--bp-accent',
        '--bp-on-accent',
        '--bp-gap',
        '--bp-list',
        '--bp-code-ink',
        '--bp-code-bg',
        '--bp-code-size',
        '--bp-code-pad',
        '--bp-code-radius',
    ],
} as const satisfies Record<string, readonly string[]>;

export const RECIPE_PROPERTIES: readonly string[] = Object.values(RECIPE_PROPERTY_GROUPS).flat();
const PROPERTIES: ReadonlySet<string> = new Set(RECIPE_PROPERTIES);

const FUNCTIONS: ReadonlySet<string> = new Set([
    'rgb',
    'rgba',
    'hsl',
    'hsla',
    'hwb',
    'lab',
    'lch',
    'oklab',
    'oklch',
    'color-mix',
    'calc',
    'min',
    'max',
    'clamp',
    'minmax',
    'repeat',
    'fit-content',
    'var',
    'linear-gradient',
    'radial-gradient',
    'conic-gradient',
    'repeating-linear-gradient',
    'repeating-radial-gradient',
]);

/** Properties held to a fixed set of values. `position` keeps a block in the flow. */
export const ONLY_VALUES: Readonly<Record<string, readonly string[]>> = {
    position: ['static', 'relative'],
};

export const RECIPE_NAME = /^[a-z][a-z0-9-]{0,39}$/;
const CLASS_NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,39}$/;
export const MAX_RECIPES = 100;
export const MAX_DECLARATIONS = 40;
export const MAX_CLASSES = 8;
const MAX_VALUE = 240;

const QUOTED = /'[A-Za-z0-9 -]{1,60}'|"[A-Za-z0-9 -]{1,60}"/g;
const ALPHABET = /^[A-Za-z0-9 #%.,()/+*-]+$/;
const CALL = /(-?[A-Za-z_][A-Za-z0-9_-]*)\(/g;
const VAR_ARGUMENT = /^var\(\s*--[A-Za-z0-9-]{1,60}\s*[,)]/;
const REFERENCE = /\{([A-Za-z][A-Za-z0-9-]{0,39})(?:\.([A-Za-z][A-Za-z0-9-]{0,39}))?\}/g;

/** The theme groups a value may name as `{group.key}`, with the keys the engine's theme holds. */
export const REFERENCE_GROUPS: Readonly<Record<string, readonly string[]>> = {
    colors: THEME_COLOR_NAMES,
    space: ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'],
    radii: ['panel', 'control', 'pill'],
    text: ['meta', 'small', 'body', 'lead', 'subheading', 'heading', 'title', 'display', 'pageTitle'],
    fonts: ['heading', 'body', 'mono'],
    layout: ['prose', 'wide', 'gutter', 'columnMin'],
};

/** Whether a value, with every reference already resolved, is one the engine writes into a style. */
export function recipeValueOk(value: string): boolean {
    if (value.length === 0 || value.length > MAX_VALUE) return false;
    if (value.includes('/*') || value.includes('*/')) return false;
    const bare = value.replace(QUOTED, 'q');
    if (!ALPHABET.test(bare)) return false;

    let depth = 0;
    for (const ch of bare) {
        if (ch === '(') depth++;
        else if (ch === ')' && --depth < 0) return false;
        if (depth > 6) return false;
    }
    if (depth !== 0) return false;

    for (const call of bare.matchAll(CALL)) {
        const name = call[1].toLowerCase();
        if (!FUNCTIONS.has(name)) return false;
        if (name === 'var' && !VAR_ARGUMENT.test(bare.slice(call.index))) return false;
    }
    return true;
}

export interface Declaration {
    property: string;
    value: string;
}

export interface RecipeRow {
    name: string;
    class: string;
    declarations: Declaration[];
}

export interface StoredRecipe {
    class?: string;
    style: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The stored map as rows. Null for a value of another shape, which the screen then shows as JSON. */
export function readRecipes(value: unknown): RecipeRow[] | null {
    if (value === undefined || value === null) return [];
    if (!isRecord(value)) return null;
    const rows: RecipeRow[] = [];
    for (const [name, spec] of Object.entries(value)) {
        if (!isRecord(spec) || !Object.keys(spec).every((k) => k === 'class' || k === 'style')) return null;
        const cls = spec.class ?? '';
        const style = spec.style ?? {};
        if (typeof cls !== 'string' || !isRecord(style)) return null;
        const entries = Object.entries(style);
        if (!entries.every(([, v]) => typeof v === 'string')) return null;
        rows.push({ name, class: cls, declarations: entries.map(([property, v]) => ({ property, value: v as string })) });
    }
    return rows;
}

/**
 * Back to the stored map. A recipe with no name, or a name taken above it, is left out, and so is a
 * declaration with no property or one a declaration above it already set.
 */
export function writeRecipes(rows: readonly RecipeRow[]): Record<string, StoredRecipe> {
    const out: Record<string, StoredRecipe> = {};
    for (const row of rows) {
        const name = row.name.trim();
        if (name === '' || Object.hasOwn(out, name)) continue;
        const style: Record<string, string> = {};
        for (const { property, value } of row.declarations) {
            if (property === '' || Object.hasOwn(style, property)) continue;
            style[property] = value.trim();
        }
        const cls = row.class.trim().split(/\s+/).filter(Boolean).join(' ');
        out[name] = { ...(cls ? { class: cls } : {}), style };
    }
    return out;
}

export function recipeNameProblem(name: string): string | null {
    return RECIPE_NAME.test(name.trim())
        ? null
        : 'A name is a lower case letter, then lower case letters, digits and hyphens, up to 40 characters.';
}

export function classProblem(value: string): string | null {
    const names = value.trim().split(/\s+/).filter(Boolean);
    if (names.length > MAX_CLASSES) return `Up to ${MAX_CLASSES} class names.`;
    const bad = names.find((n) => !CLASS_NAME.test(n));
    return bad ? `${bad} is not a class name: a letter or _, then letters, digits, _ and -.` : null;
}

/** Why the engine would drop this declaration when it reads the settings, or null. */
export function declarationProblem({ property, value }: Declaration): string | null {
    if (!PROPERTIES.has(property)) return `${property} is not a property a recipe may set.`;
    const trimmed = value.trim();
    if (trimmed === '') return 'Needs a value.';
    const only = ONLY_VALUES[property];
    if (only) return only.includes(trimmed) ? null : `Has to be one of: ${only.join(', ')}.`;
    return recipeValueOk(trimmed.replace(REFERENCE, '0'))
        ? null
        : 'The site refuses this value. Use letters, digits, spaces and # % . , ( ) / + * -, quotes only around a font name, and only the CSS functions a recipe allows.';
}

/**
 * References the tenant's settings cannot resolve. The engine keeps the declaration and leaves it
 * out when the block draws, so this is a warning: a token may be set in the site's own config.
 */
export function unresolvedReferences(value: string, tokens: Readonly<Record<string, string>>): string[] {
    const missing: string[] = [];
    for (const [raw, name, key] of value.matchAll(REFERENCE)) {
        const known =
            key === undefined
                ? Object.hasOwn(tokens, name)
                : Object.hasOwn(REFERENCE_GROUPS, name) && REFERENCE_GROUPS[name].includes(key);
        if (!known) missing.push(raw);
    }
    return missing;
}

/** Every reference a value could use here, for the value box to offer. */
export function referenceOptions(tokens: Readonly<Record<string, string>>): string[] {
    return [
        ...Object.keys(tokens).map((name) => `{${name}}`),
        ...Object.entries(REFERENCE_GROUPS).flatMap(([group, keys]) => keys.map((key) => `{${group}.${key}}`)),
    ];
}

/** What is wrong with a recipe as a whole, beside its own rows. */
export function recipeProblem(row: RecipeRow): string | null {
    const set = row.declarations.filter((d) => d.property !== '').length;
    if (set > MAX_DECLARATIONS) return `Up to ${MAX_DECLARATIONS} properties. The site reads the first ${MAX_DECLARATIONS}.`;
    if (set === 0 && row.class.trim() === '') return 'Give it a class or at least one property. The site drops an empty recipe.';
    return null;
}

/** The names a block may wear, in the order they were saved. */
export function recipeNames(value: unknown): string[] {
    return (readRecipes(value) ?? []).map((r) => r.name).filter((name) => recipeNameProblem(name) === null);
}

/**
 * Why a save would store a recipe the engine drops, or null. Only when the site type declares the
 * field: otherwise the screen does not edit it, and a value it cannot fix must not block a save.
 */
export function recipesProblem(values: Record<string, unknown>, schema: SiteTypeFields): string | null {
    if (!schema.fields.some((f) => f.name === RECIPES_FIELD)) return null;
    const rows = readRecipes(values[RECIPES_FIELD]);
    if (!rows) return null;
    if (rows.length > MAX_RECIPES) return `The site reads the first ${MAX_RECIPES} recipes. Remove some to save.`;
    const bad = rows.filter(
        (r) =>
            recipeNameProblem(r.name) ||
            classProblem(r.class) ||
            recipeProblem(r) ||
            r.declarations.some((d) => d.property !== '' && declarationProblem(d)),
    ).length;
    return bad > 0 ? `${bad === 1 ? 'A recipe has' : `${bad} recipes have`} a problem the site would drop. Fix it to save.` : null;
}

/** The theme values a preview resolves `{name}` and `{group.key}` against. */
export interface PreviewTheme {
    tokens: Readonly<Record<string, string>>;
    groups: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

function resolve(theme: PreviewTheme, value: string): string | undefined {
    let missing = false;
    const out = value.replace(REFERENCE, (_, name: string, key: string | undefined) => {
        const found =
            key === undefined
                ? Object.hasOwn(theme.tokens, name)
                    ? theme.tokens[name]
                    : undefined
                : theme.groups[name]?.[key];
        if (found === undefined) missing = true;
        return found ?? '';
    });
    return !missing && recipeValueOk(out) ? out : undefined;
}

function camel(property: string): string {
    return property.startsWith('--') ? property : property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * The style a block wearing this recipe is drawn with, resolved the way the engine resolves it: a
 * declaration that fails, or whose reference does not resolve, is left out and the rest kept.
 */
export function previewStyle(row: RecipeRow, theme: PreviewTheme): CSSProperties {
    const style: Record<string, string> = {};
    const seen = new Set<string>();
    for (const declaration of row.declarations) {
        const key = camel(declaration.property);
        // The save keeps the first of a property set twice, so the preview draws that one too.
        if (declaration.property === '' || Object.hasOwn(style, key) || seen.has(key)) continue;
        seen.add(key);
        if (declarationProblem(declaration)) continue;
        const value = declaration.value.trim();
        const resolved = ONLY_VALUES[declaration.property] ? value : resolve(theme, value);
        if (resolved !== undefined) style[key] = resolved;
    }
    return style as CSSProperties;
}
