import { describe, expect, it, vi } from 'vitest';
import { checkSvg, registerIcon, registeredIcon, serialiseIcon } from './icon-svg';

const VALID =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M1 1 L2 2" fill="red" stroke="blue"/></svg>';

describe('the custom icon check', () => {
    it('accepts an svg with a viewBox and a shape, and forces currentColor', () => {
        const result = checkSvg(VALID);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.symbol.viewBox).toBe('0 0 32 32');
        expect(result.svg).toContain('fill="currentColor"');
        expect(result.svg).not.toContain('red');
        expect(result.svg).not.toContain('stroke');
    });

    it('drops a script and keeps the shapes', () => {
        const result = checkSvg(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><script>alert(1)</script><style>*{}</style><circle cx="4" cy="4" r="2"/></svg>'
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.svg).not.toMatch(/script|style|alert/);
        expect(result.svg).toContain('<circle');
    });

    it('drops an onload attribute from the root and from a shape', () => {
        const result = checkSvg(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" onload="alert(1)"><rect x="1" y="1" width="4" height="4" onclick="alert(2)"/></svg>'
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.svg).not.toMatch(/onload|onclick|alert/);
    });

    it('refuses an svg with no viewBox', () => {
        expect(checkSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1"/></svg>').ok).toBe(false);
    });

    it('refuses an svg with a viewBox and no shape', () => {
        expect(
            checkSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><script>1</script></svg>').ok
        ).toBe(false);
    });

    it('refuses markup that is not an svg', () => {
        expect(checkSvg('<div>hi</div>').ok).toBe(false);
        expect(checkSvg('not xml <').ok).toBe(false);
        expect(checkSvg('').ok).toBe(false);
    });

    it('drops an attribute value that carries anything outside numbers and path commands', () => {
        const result = checkSvg(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M1 1" opacity="url(javascript:x)"/><path d="M2 2"/></svg>'
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.svg).not.toContain('javascript');
    });
});

describe('markup with a document type', () => {
    it('refuses a DOCTYPE and an ENTITY before parsing', () => {
        const bomb =
            '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M1 1"/></svg>';
        expect(checkSvg(bomb).ok).toBe(false);
        expect(
            checkSvg('<!entity x "y"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="M1 1"/></svg>').ok
        ).toBe(false);
    });

    it('does not parse the same markup twice', () => {
        const spy = vi.spyOn(DOMParser.prototype, 'parseFromString');
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><path d="M2 2"/></svg>';
        const first = checkSvg(svg);
        const second = checkSvg(svg);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(second).toBe(first);
        spy.mockRestore();
    });

    it('does not tell people that only outlines survive, because fills do, in the text colour', () => {
        const refused = checkSvg('<div/>');
        expect(refused.ok).toBe(false);
        if (!refused.ok) {
            expect(refused.error).not.toMatch(/outline/i);
            expect(refused.error).toMatch(/text colour/);
        }
    });
});

describe('the icon registry', () => {
    it('hands out ic-custom ids and gives the same shapes the same id', () => {
        const a = checkSvg(VALID);
        if (!a.ok) throw new Error('fixture');
        const id = registerIcon(a.symbol);
        expect(id).toMatch(/^ic-custom-\d+$/);
        expect(registerIcon(a.symbol)).toBe(id);
        expect(serialiseIcon(registeredIcon(id)!)).toBe(a.svg);
    });
});
