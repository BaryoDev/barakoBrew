import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CustomIconSprite, TYPE_GLYPHS, TypeIcon } from './type-icon';

describe('a content type icon', () => {
    it('offers 20 distinct glyphs', () => {
        expect(TYPE_GLYPHS).toHaveLength(20);
        expect(new Set(TYPE_GLYPHS.map((g) => g.name)).size).toBe(20);
    });

    it('draws a named glyph and falls back for a name it does not know', () => {
        const known = render(<TypeIcon icon={{ name: 'ic-key' }} />);
        const knownPath = known.container.querySelector('svg')?.innerHTML;
        known.unmount();
        const unknown = render(<TypeIcon icon={{ name: 'ic-not-a-glyph' }} />);
        const none = render(<TypeIcon icon={null} />);

        expect(knownPath).toBeTruthy();
        expect(unknown.container.querySelector('svg')?.innerHTML).toBeTruthy();
        expect(unknown.container.querySelector('svg')?.innerHTML).not.toBe(knownPath);
        expect(none.container.querySelector('svg')?.innerHTML).toBe(unknown.container.querySelector('svg')?.innerHTML);
    });

    it('draws custom markup through a registered symbol, not as inline HTML', () => {
        const svg = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
        const { container } = render(
            <>
                <CustomIconSprite />
                <TypeIcon icon={{ svg }} />
            </>,
        );

        const use = container.querySelector('use');
        expect(use?.getAttribute('href')).toMatch(/^#ic-custom-\d+$/);
        const symbol = container.querySelector(`symbol[id="${use?.getAttribute('href')?.slice(1)}"]`);
        expect(symbol).not.toBeNull();
        expect(symbol?.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(symbol?.querySelector('path')?.getAttribute('fill')).toBe('currentColor');
    });

    it('never draws stored markup the allowlist would have removed', () => {
        const stored =
            '<svg viewBox="0 0 24 24" onload="alert(1)"><script>alert(1)</script><path d="M0 0h24v24H0z" onclick="alert(1)" fill="red"/></svg>';
        const { container } = render(
            <>
                <CustomIconSprite />
                <TypeIcon icon={{ svg: stored }} />
            </>,
        );

        const sprite = container.querySelector('[data-custom-icon-sprite]');
        expect(sprite?.querySelectorAll('symbol')).toHaveLength(1);
        expect(sprite?.innerHTML).not.toMatch(/script|onload|onclick|alert|red/i);
    });

    it('falls back to the default glyph for stored markup with no shape', () => {
        const { container } = render(<TypeIcon icon={{ svg: '<svg viewBox="0 0 24 24"><script>x</script></svg>' }} />);

        expect(container.querySelector('use')).toBeNull();
        expect(container.querySelector('svg path')).not.toBeNull();
    });
});
