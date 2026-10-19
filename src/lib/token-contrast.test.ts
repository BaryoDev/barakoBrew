import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
const start = css.indexOf(':root {');
const rootBlock = css.slice(start, css.indexOf('\n}', start));
const tokens = new Map<string, string>(
    Array.from(rootBlock.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g), (m): [string, string] => [m[1], m[2]]),
);

function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
    const a = luminance(tokens.get(fg)!);
    const b = luminance(tokens.get(bg)!);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Every text token round 2 touched, on each surface it is drawn on. Light theme only. */
const PAIRS: Array<[string, string]> = [
    ['foreground', 'background'],
    ['foreground', 'card'],
    ['foreground', 'secondary'],
    ['secondary-foreground', 'background'],
    ['secondary-foreground', 'secondary'],
    ['secondary-foreground', 'card'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['muted-foreground', 'secondary'],
    ['faint', 'background'],
    ['faint', 'card'],
    ['faint', 'secondary'],
    ['destructive', 'background'],
    ['destructive', 'card'],
    ['destructive', 'danger-soft'],
    ['warning', 'background'],
    ['warning', 'card'],
    ['warning', 'warning-soft'],
    ['accent-foreground', 'accent'],
];

describe('light theme text contrast', () => {
    it('checks every pair against a token that exists in :root', () => {
        expect(PAIRS).toHaveLength(19);
        for (const [fg, bg] of PAIRS) {
            expect(tokens.has(fg), `--${fg}`).toBe(true);
            expect(tokens.has(bg), `--${bg}`).toBe(true);
        }
    });

    it.each(PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
});
