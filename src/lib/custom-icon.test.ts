import { describe, it, expect } from 'vitest';
import { checkCustomSvg, reserveCustomIcon } from './custom-icon';

const SHAPE = '<path d="M0 0h24v24H0z"/>';

describe('checking a pasted SVG', () => {
    it('accepts a viewBox and a shape and fills the shape with the text colour', () => {
        const result = checkCustomSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${SHAPE}</svg>`);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.icon.nodes).toHaveLength(1);
        expect(result.icon.nodes[0].attrs.fill).toBe('currentColor');
        expect(result.svg).toContain('viewBox="0 0 24 24"');
    });

    it('replaces a fill and a stroke on a shape rather than keeping them', () => {
        const result = checkCustomSvg(
            '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="red" stroke="blue" stroke-width="3"/></svg>',
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.icon.nodes[0].attrs).toEqual({ d: 'M0 0h24v24H0z', fill: 'currentColor' });
        expect(result.svg).not.toContain('red');
        expect(result.svg).not.toContain('stroke');
    });

    it('drops scripts, styles, event attributes and links but keeps the shapes', () => {
        const result = checkCustomSvg(
            `<svg viewBox="0 0 24 24" onload="alert(1)">
                <script>alert(1)</script>
                <style>path { fill: red }</style>
                <a href="javascript:alert(1)"><circle cx="1" cy="1" r="1" onclick="alert(1)"/></a>
                <foreignObject><div>x</div></foreignObject>
                ${SHAPE}
            </svg>`,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.icon.nodes.map((n) => n.tag)).toEqual(['path']);
        expect(result.svg).not.toMatch(/script|style|onload|onclick|alert|javascript|foreignObject/i);
    });

    it('refuses an SVG with no viewBox', () => {
        const result = checkCustomSvg(`<svg>${SHAPE}</svg>`);

        expect(result).toEqual({ ok: false, error: 'The SVG needs a viewBox.' });
    });

    it('refuses an SVG with a viewBox but no shape', () => {
        const result = checkCustomSvg('<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>');

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toMatch(/needs a shape/);
    });

    it('refuses text that is not an SVG', () => {
        expect(checkCustomSvg('<div>no</div>').ok).toBe(false);
        expect(checkCustomSvg('not markup').ok).toBe(false);
        expect(checkCustomSvg('   ').ok).toBe(false);
    });
});

describe('registering a custom icon', () => {
    it('hands out one ic-custom id per distinct markup', () => {
        const a = reserveCustomIcon(`<svg viewBox="0 0 24 24">${SHAPE}</svg>`);
        const b = reserveCustomIcon('<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4"/></svg>');
        const again = reserveCustomIcon(`<svg viewBox="0 0 24 24">${SHAPE}</svg>`);

        expect(a).toMatch(/^ic-custom-\d+$/);
        expect(b).toMatch(/^ic-custom-\d+$/);
        expect(a).not.toBe(b);
        expect(again).toBe(a);
    });

    it('registers nothing for stored markup that fails the check', () => {
        expect(reserveCustomIcon('<svg><script>alert(1)</script></svg>')).toBeNull();
    });
});
