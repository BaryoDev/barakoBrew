/**
 * The shapes of the `site` type's JSON fields, as barakoCMS docs/site-settings.md documents them.
 *
 * The API checks only that a JSON field holds JSON, so these readers are where a shape is checked.
 * Each one returns null for a stored value it cannot show without losing part of it (an extra key,
 * a number where a string belongs), and the screen then shows that field as JSON instead of quietly
 * dropping what it did not understand. An absent value reads as empty, not as unreadable.
 */

export const SITE_TYPE = 'site';
export const SITE_BLUEPRINT = 'site';

export interface SiteLink {
    label: string;
    href: string;
}

export interface TopBar {
    text: string;
    links: SiteLink[];
}

export interface FooterColumn {
    heading: string;
    links: SiteLink[];
}

export interface SocialLink {
    network: string;
    href: string;
}

export interface ThemeVariant {
    name: string;
    label: string;
    colors: Record<string, string>;
}

/** One row of OptionColors, flattened: `project.AreaOfFocus`, an option, and a colour name. */
export interface OptionColorRow {
    field: string;
    option: string;
    color: string;
}

/** The colour names barakoPress reads as theme slots. Any other name is a site colour. */
export const COLOR_SLOTS = [
    'pageBg',
    'surface',
    'ink',
    'proseInk',
    'secondaryInk',
    'muted',
    'hairline',
    'accent',
    'accentHover',
    'accentInk',
    'accentTint',
    'accentTintBorder',
    'accentTintBorderStrong',
    'darkPanel',
    'darkPanelChrome',
    'darkPanelInk',
    'darkPanelAccent',
    'codeGreen',
    'success',
] as const;

export const FONT_ROLES = ['heading', 'body', 'mono'] as const;
export const RADII_KEYS = ['panel', 'control', 'pill'] as const;
export const LAYOUT_KEYS = ['prose', 'wide', 'gutter'] as const;

const isBlank = (value: unknown) => value === undefined || value === null;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
    Object.keys(value).every((key) => allowed.includes(key));

/** A path on the site or an absolute http or https URL. The renderer drops any other scheme. */
export function isValidHref(href: string): boolean {
    const value = href.trim();
    if (value.startsWith('/')) return !value.startsWith('//');
    try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.host !== '';
    } catch {
        return false;
    }
}

/** An absolute http or https URL, for the `url` fields. */
export function isAbsoluteHttpUrl(value: string): boolean {
    return !value.trim().startsWith('/') && isValidHref(value);
}

/** A CSS length as the theme uses them: `2px`, `1.5rem`, `680px`, `0`. */
export function isCssLength(value: string): boolean {
    return /^(0|\d+(\.\d+)?(px|rem|em|%|ch|vw|vh))$/.test(value.trim());
}

/** An object of string values, such as Colors, Fonts, Radii and Layout. */
const sameValue = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * An edit to a JSON map, moved onto a newer stored value key by key.
 *
 * `base` is the stored value the edit was made from and `edit` is the whole map as this screen holds
 * it. Keys the edit changed or added are laid over `stored`, keys it removed are removed, and every
 * other key keeps what is stored now. So someone else's new key survives a save of an unrelated
 * change. A value that is not a plain object on any side is replaced whole, as before.
 */
export function rebaseMapEdit(base: unknown, edit: unknown, stored: unknown): unknown {
    if (!isPlainObject(edit) || !isPlainObject(stored) || sameValue(base, stored)) return edit;
    const before = isPlainObject(base) ? base : {};
    const next: Record<string, unknown> = { ...stored };
    for (const [key, value] of Object.entries(edit)) {
        if (!(key in before) || !sameValue(before[key], value)) next[key] = value;
    }
    for (const key of Object.keys(before)) {
        if (!(key in edit)) delete next[key];
    }
    return next;
}

export function readStringMap(value: unknown): Record<string, string> | null {
    if (isBlank(value)) return {};
    if (!isPlainObject(value)) return null;
    return Object.values(value).every((v) => typeof v === 'string') ? (value as Record<string, string>) : null;
}

function readLink(value: unknown): SiteLink | null {
    if (!isPlainObject(value) || !onlyKeys(value, ['label', 'href'])) return null;
    const { label = '', href = '' } = value;
    return typeof label === 'string' && typeof href === 'string' ? { label, href } : null;
}

function readList<T>(value: unknown, readItem: (item: unknown) => T | null): T[] | null {
    if (isBlank(value)) return [];
    if (!Array.isArray(value)) return null;
    const items = value.map(readItem);
    return items.every((item) => item !== null) ? (items as T[]) : null;
}

export function readLinks(value: unknown): SiteLink[] | null {
    return readList(value, readLink);
}

export function readTopBar(value: unknown): TopBar | null {
    if (isBlank(value)) return { text: '', links: [] };
    if (!isPlainObject(value) || !onlyKeys(value, ['text', 'links'])) return null;
    const text = value.text ?? '';
    const links = readLinks(value.links);
    return typeof text === 'string' && links ? { text, links } : null;
}

export function readFooterColumns(value: unknown): FooterColumn[] | null {
    return readList(value, (item) => {
        if (!isPlainObject(item) || !onlyKeys(item, ['heading', 'links'])) return null;
        const heading = item.heading ?? '';
        const links = readLinks(item.links);
        return typeof heading === 'string' && links ? { heading, links } : null;
    });
}

export function readSocialLinks(value: unknown): SocialLink[] | null {
    return readList(value, (item) => {
        if (!isPlainObject(item) || !onlyKeys(item, ['network', 'href'])) return null;
        const { network = '', href = '' } = item;
        return typeof network === 'string' && typeof href === 'string' ? { network, href } : null;
    });
}

export function readVariants(value: unknown): ThemeVariant[] | null {
    return readList(value, (item) => {
        if (!isPlainObject(item) || !onlyKeys(item, ['name', 'label', 'colors'])) return null;
        const name = item.name ?? '';
        const label = item.label ?? '';
        const colors = readStringMap(item.colors);
        return typeof name === 'string' && typeof label === 'string' && colors ? { name, label, colors } : null;
    });
}

export function readOptionColors(value: unknown): OptionColorRow[] | null {
    if (isBlank(value)) return [];
    if (!isPlainObject(value)) return null;
    const rows: OptionColorRow[] = [];
    for (const [field, options] of Object.entries(value)) {
        const map = readStringMap(options);
        if (!map || !isPlainObject(options)) return null;
        for (const [option, color] of Object.entries(map)) rows.push({ field, option, color });
    }
    return rows;
}

/**
 * Back to the stored shape. A row with no field or no option has nowhere to go in it, so it is
 * left out rather than stored under an empty key.
 */
export function writeOptionColors(rows: readonly OptionColorRow[]): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    for (const { field, option, color } of rows) {
        if (!field.trim() || !option.trim()) continue;
        (out[field.trim()] ??= {})[option.trim()] = color;
    }
    return out;
}

/** Sets a key, or removes it when the value is empty, so a cleared input does not store `""`. */
export function setOrRemove(map: Record<string, string>, key: string, value: string): Record<string, string> {
    const next = { ...map };
    if (value === '') delete next[key];
    else next[key] = value;
    return next;
}

/** Why the API would refuse the entry: the blueprint makes Name required. */
export function siteProblem(values: Record<string, unknown>): string | null {
    return typeof values.Name === 'string' && values.Name.trim() !== ''
        ? null
        : 'The site needs a name before it can be saved.';
}
