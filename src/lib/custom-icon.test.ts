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

describe('limits on a pasted SVG', () => {
    it('refuses markup over 16 KiB and accepts the same markup at the limit', () => {
        const head = '<svg viewBox="0 0 24 24">';
        const tail = '</svg>';
        const pad = (n: number) => `<path d="M0 0h24v24H0z"/>${' '.repeat(n)}`;
        const limit = 16 * 1024;
        const fits = head + pad(limit - head.length - tail.length - SHAPE.length) + tail;
        expect(fits.length).toBe(limit);

        expect(checkCustomSvg(fits).ok).toBe(true);
        const over = checkCustomSvg(head + pad(limit) + tail);
        expect(over.ok).toBe(false);
        if (over.ok) return;
        expect(over.error).toMatch(/most allowed is 16384/);
    });

    it('refuses a DOCTYPE and an ENTITY', () => {
        const doctype = checkCustomSvg(`<!DOCTYPE svg><svg viewBox="0 0 24 24">${SHAPE}</svg>`);
        const entity = checkCustomSvg(`<!ENTITY x "y"><svg viewBox="0 0 24 24">${SHAPE}</svg>`);

        expect(doctype).toEqual({ ok: false, error: 'A DOCTYPE or entities are not accepted.' });
        expect(entity).toEqual({ ok: false, error: 'A DOCTYPE or entities are not accepted.' });
    });

    it('refuses a viewBox that is not four numbers', () => {
        for (const viewBox of ['0 0 24', '0 0 24 abc', '0 0 24 24 5', 'a b c d']) {
            const result = checkCustomSvg(`<svg viewBox="${viewBox}">${SHAPE}</svg>`);
            expect(result.ok).toBe(false);
            if (result.ok) continue;
            expect(result.error).toMatch(/four numbers/);
        }
    });

    it('keeps a shape nested within the depth limit and drops one nested deeper', () => {
        const nest = (depth: number) =>
            `<svg viewBox="0 0 24 24">${'<g>'.repeat(depth)}${SHAPE}${'</g>'.repeat(depth)}</svg>`;

        expect(checkCustomSvg(nest(15)).ok).toBe(true);
        const deep = checkCustomSvg(nest(40));
        expect(deep.ok).toBe(false);
        if (deep.ok) return;
        expect(deep.error).toMatch(/needs a shape/);
    });

    it('keeps a shape inside a g and rebuilds the group with only allowed attributes', () => {
        const result = checkCustomSvg(
            `<svg viewBox="0 0 24 24"><g transform="translate(1 1)" id="x" onclick="alert(1)">${SHAPE}</g></svg>`,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.icon.nodes).toHaveLength(1);
        expect(result.icon.nodes[0].tag).toBe('g');
        expect(result.icon.nodes[0].attrs).toEqual({ transform: 'translate(1 1)' });
        expect(result.icon.nodes[0].children).toHaveLength(1);
        expect(result.icon.nodes[0].children[0].tag).toBe('path');
    });

    it('drops an attribute value with url( or a 13 digit token and keeps the shape', () => {
        const result = checkCustomSvg(
            `<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" transform="url(a)" opacity="1234567890123"/><circle cx="1" cy="1" r="1" opacity="0.5"/></svg>`,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.icon.nodes).toHaveLength(2);
        expect(result.icon.nodes[0].attrs).toEqual({ d: 'M0 0h24v24H0z', fill: 'currentColor' });
        expect(result.icon.nodes[1].attrs.opacity).toBe('0.5');
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
