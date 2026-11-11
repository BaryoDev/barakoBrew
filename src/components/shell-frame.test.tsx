import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '@/components/patterns/page-header';
import { Switch } from '@/components/ui/switch';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('the page frame', () => {
    it('caps the content at 1240px with the handoff padding, left-aligned as the prototype has it', () => {
        const layout = read('src/app/(admin)/layout.tsx');
        expect(layout).toContain('max-w-[1240px]');
        expect(layout).toContain('px-[clamp(20px,3vw,40px)] pt-8 pb-16');
        expect(layout).not.toContain('mx-auto');
        expect(layout).toContain("'--sidebar-width': '236px'");
        expect(layout).not.toContain('rail:rounded-xl');
    });

    it('sets the page title at 32px Bricolage 600 with -.035em tracking', () => {
        render(<PageHeader title="Entries" description="Everything you have written." />);
        const h1 = screen.getByRole('heading', { level: 1, name: 'Entries' });
        expect(h1.className).toContain('font-display');
        expect(h1.className).toContain('text-[32px]');
        expect(h1.className).toContain('font-semibold');
        expect(h1.className).toContain('tracking-[-0.035em]');
    });
});

describe('the tokens', () => {
    const css = read('src/app/globals.css');
    const block = (selector: string) => {
        const start = css.indexOf(`\n${selector} {`);
        return css.slice(start, css.indexOf('\n}', start));
    };

    it('puts the sidebar on the surface in light mode and gives both modes --code and --shadow', () => {
        const light = block(':root');
        const dark = block('.dark');
        expect(light).toContain('--sidebar: #ffffff;');
        expect(light).toContain('--code: #14162a;');
        expect(dark).toContain('--code: #090a14;');
        expect(light).toContain('--shadow: 0 1px 2px rgba(16, 18, 35, 0.05), 0 12px 32px -14px rgba(16, 18, 35, 0.18);');
        expect(dark).toContain('--shadow:');
    });

    it('defines the drawer keyframes', () => {
        expect(css).toContain('@keyframes drawer-in');
        expect(css).toContain('translateX(-105%)');
    });
});

describe('the controls', () => {
    it('sizes the default switch to 38x22 and moves its knob 18px', () => {
        render(<Switch aria-label="On" />);
        const root = screen.getByRole('switch');
        expect(root.className).toContain('data-[size=default]:h-[22px]');
        expect(root.className).toContain('data-[size=default]:w-[38px]');
        const thumb = root.querySelector('[data-slot="switch-thumb"]') as HTMLElement;
        expect(thumb.className).toContain('group-data-[size=default]/switch:data-[state=checked]:translate-x-[18px]');
        expect(thumb.className).not.toContain('translate-x-4');
    });

    it('leaves the 44px rule off the shared button sizes so an input adornment keeps its size', () => {
        const button = read('src/components/ui/button.tsx');
        expect(button).not.toContain('max-rail');
    });
});
