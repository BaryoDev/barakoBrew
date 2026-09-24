import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokensEditor, TonesEditor } from './tokens-editor';
import { RecipesEditor } from './recipes-editor';

/** A field marked invalid names the message that says why, so a screen reader reads it with the field. */
function describedBy(input: HTMLElement): string {
    const ids = input.getAttribute('aria-describedby') ?? '';
    return ids
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
}

describe('the theme editors tie each problem to its field', () => {
    it('a token name and value', () => {
        render(<TokensEditor initial={[{ name: '2bad', value: 'url(x)' }]} onChange={() => {}} />);
        const name = screen.getByRole('textbox', { name: 'Token 1 name' });
        const value = screen.getByRole('textbox', { name: 'Token 1 value' });
        expect(name.getAttribute('aria-invalid')).toBe('true');
        expect(describedBy(name)).toMatch(/A name is a letter/);
        expect(value.getAttribute('aria-invalid')).toBe('true');
        expect(describedBy(value)).toMatch(/Not a colour, a length/);
    });

    it('a tone name and part', () => {
        render(
            <TonesEditor
                initial={[{ name: 'accent', ink: 'nowhere-1', bg: '#fff', edge: '#fff' }]}
                tokens={{}}
                colors={{}}
                onChange={() => {}}
            />,
        );
        expect(describedBy(screen.getByRole('textbox', { name: 'Tone 1 name' }))).toMatch(/built-in tone/);
        expect(describedBy(screen.getByRole('combobox', { name: 'Tone 1 ink' }))).toMatch(/nowhere-1 is not a token/);
    });

    it('a recipe name, class and value', () => {
        render(
            <RecipesEditor
                initial={[{ name: 'Card', class: '2x', declarations: [{ property: 'color', value: 'url(x)' }] }]}
                tokens={{}}
                theme={{ tokens: {}, groups: { colors: { pageBg: '#ffffff', ink: '#101223' } } }}
                onChange={() => {}}
            />,
        );
        expect(describedBy(screen.getByRole('textbox', { name: 'Recipe 1 name' }))).toMatch(/lower case letter/);
        expect(describedBy(screen.getByRole('textbox', { name: 'Recipe 1 classes (optional)' }))).toMatch(/2x is not a class name/);
        expect(describedBy(screen.getByRole('combobox', { name: 'Recipe 1 property 1 value' }))).toMatch(/refuses this value/);
    });
});
