import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

function declarations(selector: string): Map<string, string> {
    const start = css.indexOf(`\n${selector} {`);
    const end = css.indexOf('\n}', start);
    const out = new Map<string, string>();
    for (const m of css.slice(start, end).matchAll(/^\s+(--[a-z0-9-]+):\s*([^;]+);/gm)) out.set(m[1], m[2].trim());
    return out;
}

describe('the dark palette', () => {
    const light = declarations(':root');
    const dark = declarations('.dark');

    it('sets every token the light palette sets, except the radius', () => {
        const missing = [...light.keys()].filter((k) => k !== '--radius' && !dark.has(k));
        expect(missing).toEqual([]);
    });

    it('uses the handoff values for the core tokens', () => {
        expect(dark.get('--background')).toBe('#0b0c16');
        expect(dark.get('--card')).toBe('#14162a');
        expect(dark.get('--primary')).toBe('#8e7df5');
        expect(dark.get('--border')).toBe('#272a45');
        expect(dark.get('--success')).toBe('#4fd1b8');
        expect(dark.get('--warning')).toBe('#f2c060');
        expect(dark.get('--destructive')).toBe('#ff8a80');
    });
});
