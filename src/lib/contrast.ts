/**
 * WCAG 2 contrast between two theme colours.
 *
 * The Theme screen reports a pair below AA and lets the save go ahead anyway: a site owner may have
 * a reason (a brand colour used only on large type, say), and the API has no opinion either. The
 * check lives here rather than on the server by decision on BaryoDev/barakoCMS#793.
 */

export type Rgb = readonly [number, number, number];

/** AA for body-size text. */
export const AA_NORMAL = 4.5;

/** `#rgb` or `#rrggbb`. Anything else, alpha included, is not a colour this can measure. */
export function parseHex(value: unknown): Rgb | null {
    if (typeof value !== 'string') return null;
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
    if (!match) return null;
    const hex =
        match[1].length === 3
            ? match[1]
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : match[1];
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
}

/** `#rrggbb` lowercased, for a native colour input, which accepts no other form. */
export function toLongHex(value: unknown): string | null {
    const rgb = parseHex(value);
    if (!rgb) return null;
    return '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** Relative luminance as WCAG 2.2 defines it, sRGB channels linearised. */
export function relativeLuminance([r, g, b]: Rgb): number {
    const linear = (channel: number) => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** From 1 to 21, or null when either side is not a readable hex colour. */
export function contrastRatio(foreground: unknown, background: unknown): number | null {
    const fg = parseHex(foreground);
    const bg = parseHex(background);
    if (!fg || !bg) return null;
    const a = relativeLuminance(fg);
    const b = relativeLuminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Two decimals, rounded down, so 4.499 never reads as a pass of 4.50. */
export function formatRatio(ratio: number): string {
    return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}

export interface ContrastPair {
    label: string;
    foreground: string;
    background: string;
}

/**
 * The text-on-background pairs barakoPress draws from its theme slots. A slot that is not text
 * (hairline, the tint borders) is left out, since AA for text does not apply to it.
 */
export const THEME_PAIRS: readonly ContrastPair[] = [
    { label: 'Body text on the page', foreground: 'ink', background: 'pageBg' },
    { label: 'Article text on the page', foreground: 'proseInk', background: 'pageBg' },
    { label: 'Secondary text on the page', foreground: 'secondaryInk', background: 'pageBg' },
    { label: 'Muted text on the page', foreground: 'muted', background: 'pageBg' },
    { label: 'Links on the page', foreground: 'accent', background: 'pageBg' },
    { label: 'Body text on a card', foreground: 'ink', background: 'surface' },
    { label: 'Button text on the accent', foreground: 'accentInk', background: 'accent' },
    { label: 'Button text on hover', foreground: 'accentInk', background: 'accentHover' },
    { label: 'Body text on a tinted panel', foreground: 'ink', background: 'accentTint' },
    { label: 'Text on a dark band', foreground: 'darkPanelInk', background: 'darkPanel' },
    { label: 'Accent on a dark band', foreground: 'darkPanelAccent', background: 'darkPanel' },
];

export type ContrastVerdict = 'pass' | 'below' | 'unset' | 'unreadable';

export interface ContrastResult extends ContrastPair {
    ratio: number | null;
    verdict: ContrastVerdict;
}

function verdictFor(colors: Record<string, string>, foreground: string, background: string) {
    const fg = colors[foreground];
    const bg = colors[background];
    if (fg === undefined || fg === '' || bg === undefined || bg === '') {
        return { ratio: null, verdict: 'unset' as const };
    }
    const ratio = contrastRatio(fg, bg);
    if (ratio === null) return { ratio: null, verdict: 'unreadable' as const };
    // Compared on the rounded-down figure the screen shows, so a pair never reads 4.50 and fails.
    return { ratio, verdict: Math.floor(ratio * 100) / 100 >= AA_NORMAL ? ('pass' as const) : ('below' as const) };
}

export function checkContrast(
    colors: Record<string, string>,
    pairs: readonly ContrastPair[] = THEME_PAIRS,
): ContrastResult[] {
    return pairs.map((pair) => ({ ...pair, ...verdictFor(colors, pair.foreground, pair.background) }));
}

/** Each named colour against one background, for the site colours blocks draw as text. */
export function checkAgainst(
    colors: Record<string, string>,
    names: readonly string[],
    background: string,
): ContrastResult[] {
    return names
        .filter((name) => name !== background)
        .map((name) => ({
            label: `${name} on ${background}`,
            foreground: name,
            background,
            ...verdictFor(colors, name, background),
        }));
}

export function countBelow(results: readonly ContrastResult[]): number {
    return results.filter((r) => r.verdict === 'below').length;
}
