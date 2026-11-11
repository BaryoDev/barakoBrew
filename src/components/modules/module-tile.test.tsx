import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IconAiMark, IconBolt, IconCube, IconFlag } from '@/components/icons';
import { isModuleGlyph } from '@/lib/module-catalog';
import { GLYPH, ModuleTile } from './module-tile';

const svgOf = (ui: React.ReactElement) => {
    const { container, unmount } = render(ui);
    const html = container.querySelector('svg')!.innerHTML;
    unmount();
    return html;
};

const drawn = (ui: React.ReactElement) => {
    render(ui);
    return screen.getByTestId('module-tile').querySelector('svg')!.innerHTML;
};

describe('ModuleTile glyph', () => {
    it('draws the flag when the API glyph is flag', () => {
        const html = drawn(<ModuleTile module={{ name: 'Community.Thing', glyph: 'flag' }} />);
        expect(html).toBe(svgOf(<IconFlag />));
        expect(html).not.toBe(svgOf(<IconCube />));
    });

    it('draws the nine-dot AI mark for the AI module, not the bolt or the cube', () => {
        const html = drawn(<ModuleTile module={{ name: 'AI' }} />);
        expect(html).toBe(svgOf(<IconAiMark />));
        expect(html).not.toBe(svgOf(<IconBolt />));
        expect(html).not.toBe(svgOf(<IconCube />));
    });

    it('treats every drawable glyph as known, so a new one is not ignored', () => {
        for (const key of Object.keys(GLYPH)) expect(isModuleGlyph(key), key).toBe(true);
    });
});
