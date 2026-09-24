import { describe, expect, it } from 'vitest';
import {
    RECIPE_PROPERTIES,
    recipeValueOk,
    classProblem,
    declarationProblem,
    previewStyle,
    readRecipes,
    recipeNameProblem,
    recipeNames,
    recipeProblem,
    recipesProblem,
    unresolvedReferences,
    writeRecipes,
    type PreviewTheme,
} from './recipes';

const DECLARED = { fields: [{ name: 'StyleRecipes' }] };

const ok = (property: string, value: string) => declarationProblem({ property, value }) === null;

describe('declarationProblem', () => {
    it('accepts the values in the engine README example', () => {
        expect(ok('padding', '22px 24px')).toBe(true);
        expect(ok('background', '{colors.surface}')).toBe(true);
        expect(ok('border', '1px solid {colors.hairline}')).toBe(true);
        expect(ok('box-shadow', '0 1px 2px rgba(16,18,35,.04)')).toBe(true);
        expect(ok('font-family', "{fonts.mono}")).toBe(true);
        expect(ok('font-family', "'JetBrains Mono', monospace")).toBe(true);
        expect(ok('letter-spacing', '.16em')).toBe(true);
        expect(ok('--bp-ink', 'var(--t-cms-ink, #1D3A8A)')).toBe(true);
        expect(ok('width', 'calc(100% - {space.md})')).toBe(true);
        expect(ok('position', 'relative')).toBe(true);
    });

    it('refuses what could leave the declaration or load something', () => {
        expect(ok('color', 'red; position: fixed')).toBe(false);
        expect(ok('background', 'url(https://evil.example/x.png)')).toBe(false);
        expect(ok('background', 'image-set(x)')).toBe(false);
        expect(ok('color', 'red !important')).toBe(false);
        expect(ok('color', 'red /* x */')).toBe(false);
        expect(ok('width', 'calc(100% - 2px')).toBe(false);
        expect(ok('color', 'var(x)')).toBe(false);
        expect(ok('color', '{not a ref}')).toBe(false);
        expect(ok('font-family', '"Evil<script>"')).toBe(false);
        expect(ok('color', '')).toBe(false);
        expect(ok('color', 'a'.repeat(241))).toBe(false);
    });

    it('refuses a call to a function whose name holds a digit or an underscore', () => {
        expect(ok('color', 'x9(y)')).toBe(false);
        expect(ok('width', 'calc2(1px)')).toBe(false);
        expect(ok('width', 'r2d2(1px)')).toBe(false);
        expect(ok('color', 'var(--a, x9(y))')).toBe(false);
        expect(ok('width', '_f(1px)')).toBe(false);
    });

    it('holds position to the two values that keep a block in the flow', () => {
        expect(declarationProblem({ property: 'position', value: 'absolute' })).toMatch(/static, relative/);
    });

    it('refuses a property off the list', () => {
        expect(RECIPE_PROPERTIES).toContain('border-radius');
        expect(declarationProblem({ property: 'behavior', value: 'x' })).toMatch(/not a property/);
        expect(declarationProblem({ property: 'Color', value: 'red' })).toMatch(/not a property/);
    });
});

describe('names and classes', () => {
    it('hold a recipe name to lower case', () => {
        expect(recipeNameProblem('card')).toBeNull();
        expect(recipeNameProblem('card-2')).toBeNull();
        expect(recipeNameProblem('Card')).not.toBeNull();
        expect(recipeNameProblem('2card')).not.toBeNull();
    });

    it('take up to eight class names', () => {
        expect(classProblem('lift card_x')).toBeNull();
        expect(classProblem('')).toBeNull();
        expect(classProblem('a b c d e f g h i')).toMatch(/Up to 8/);
        expect(classProblem('lift 2x')).toMatch(/2x is not a class name/);
    });

    it('refuse a recipe with nothing to say', () => {
        expect(recipeProblem({ name: 'card', class: '', declarations: [] })).toMatch(/drops an empty recipe/);
        expect(recipeProblem({ name: 'card', class: 'lift', declarations: [] })).toBeNull();
    });
});

describe('reading and writing', () => {
    const stored = {
        card: { class: 'lift', style: { padding: '22px 24px', background: '{colors.surface}' } },
        eyebrow: { style: { 'font-family': '{fonts.mono}' } },
    };

    it('round trips the documented shape', () => {
        const rows = readRecipes(stored);
        expect(rows).toHaveLength(2);
        expect(rows![0].declarations).toHaveLength(2);
        expect(writeRecipes(rows!)).toEqual(stored);
        expect(recipeNames(stored)).toEqual(['card', 'eyebrow']);
    });

    it('reads another shape as unreadable, so the screen shows JSON', () => {
        expect(readRecipes({ card: { style: { padding: 4 } } })).toBeNull();
        expect(readRecipes({ card: { hover: {} } })).toBeNull();
    });

    it('leaves out an unnamed recipe, a repeated name, and a declaration with no property', () => {
        expect(
            writeRecipes([
                { name: 'card', class: '', declarations: [{ property: 'padding', value: '4px' }, { property: '', value: 'x' }] },
                { name: '', class: 'x', declarations: [] },
                { name: 'card', class: '', declarations: [{ property: 'margin', value: '0' }] },
            ]),
        ).toEqual({ card: { style: { padding: '4px' } } });
    });

    it('refuses a save holding a declaration the engine drops', () => {
        expect(recipesProblem({ StyleRecipes: stored }, DECLARED)).toBeNull();
        expect(recipesProblem({ StyleRecipes: { card: { style: { background: 'url(x)' } } } }, DECLARED)).toMatch(/A recipe has/);
        expect(recipesProblem({ StyleRecipes: { Card: { style: { padding: '0' } } } }, DECLARED)).toMatch(/A recipe has/);
    });
});

describe('references', () => {
    it('warn about a token or a theme key the settings do not have', () => {
        expect(unresolvedReferences('1px solid {colors.hairline}', {})).toEqual([]);
        expect(unresolvedReferences('{accent}', { accent: '#E4572E' })).toEqual([]);
        expect(unresolvedReferences('{accent} {space.huge} {sizes.md}', {})).toEqual(['{accent}', '{space.huge}', '{sizes.md}']);
    });

    it('resolve in the preview, leaving out a declaration that does not', () => {
        const theme: PreviewTheme = {
            tokens: { accent: '#E4572E' },
            groups: { colors: { surface: '#FFFFFF' }, space: { md: '20px' } },
        };
        const style = previewStyle(
            {
                name: 'card',
                class: '',
                declarations: [
                    { property: 'background', value: '{colors.surface}' },
                    { property: 'color', value: '{accent}' },
                    { property: 'padding', value: '{space.md} {space.huge}' },
                    { property: 'border-radius', value: 'url(x)' },
                    { property: '--bp-ink', value: '#101223' },
                ],
            },
            theme,
        );
        expect(style).toEqual({ background: '#FFFFFF', color: '#E4572E', '--bp-ink': '#101223' });
    });
});

/*
 * The verdicts barakoPress's own recipeValueOk gives these inputs (src/recipes.ts on its master),
 * so a change to either copy that makes them disagree fails here.
 */
const ENGINE_VERDICTS: [string, boolean][] = [
    ['22px 24px', true],
    ['0 1px 2px rgba(16,18,35,.04)', true],
    ["'JetBrains Mono', monospace", true],
    ['var(--t-cms-ink, #1D3A8A)', true],
    ['calc(100% - 20px)', true],
    ['repeat(3, minmax(0, 1fr))', true],
    ['linear-gradient(90deg, #fff, #000)', true],
    ['color-mix(in oklab, #fff 40%, #000)', true],
    ['relative', true],
    ['.16em', true],
    ['fit-content(20px)', true],
    ['red; position: fixed', false],
    ['url(https://evil.example/x.png)', false],
    ['image-set(x)', false],
    ['red !important', false],
    ['red /* x */', false],
    ['calc(100% - 2px', false],
    ['1px)', false],
    ['var(x)', false],
    ['x9(y)', false],
    ['calc2(1px)', false],
    ['r2d2(1px)', false],
    ['var(--a, x9(y))', false],
    ['_f(1px)', false],
    ['-webkit-calc(1px)', false],
    ['attr(data-x)', false],
    ['expression(alert(1))', false],
    ['"Evil<script>"', false],
    ['a:b', false],
    ['{x}', false],
    ['', false],
    ['a'.repeat(241), false],
    ['calc(calc(calc(calc(calc(calc(calc(1px)))))))', false],
];

describe('recipeValueOk against the engine', () => {
    it.each(ENGINE_VERDICTS)('gives %j the verdict the engine gives', (value, verdict) => {
        expect(recipeValueOk(value)).toBe(verdict);
    });
});

describe('the preview and the save agree', () => {
    it('draws the first of two declarations of one property, the one the save keeps', () => {
        const row = {
            name: 'card',
            class: '',
            declarations: [
                { property: 'color', value: 'red' },
                { property: 'color', value: 'blue' },
            ],
        };
        expect(writeRecipes([row]).card.style).toEqual({ color: 'red' });
        expect(previewStyle(row, { tokens: {}, groups: {} })).toEqual({ color: 'red' });
    });
});

describe('recipesProblem and the site type', () => {
    const bad = { StyleRecipes: { card: { style: { background: 'url(x)' } } } };

    it('says nothing about a field the site type does not declare, which the screen does not edit', () => {
        expect(recipesProblem(bad, { fields: [{ name: 'Name' }] })).toBeNull();
        expect(recipesProblem(bad, { fields: [{ name: 'StyleRecipes' }] })).toMatch(/A recipe has/);
    });
});
