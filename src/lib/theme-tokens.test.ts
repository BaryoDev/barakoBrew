import { describe, expect, it } from 'vitest';
import type { BlockSchema } from './blocks';
import {
    readTones,
    repeatedNames,
    resolveToneColour,
    tokenKind,
    tokenNameProblem,
    tokensAndTonesProblem,
    toneColourProblem,
    toneNameProblem,
    toneNames,
    validTokens,
    withTones,
    writeTokens,
    writeTones,
} from './theme-tokens';

describe('tokenKind', () => {
    it('reads the values the engine documents', () => {
        expect(tokenKind('#E4572E')).toBe('colour');
        expect(tokenKind('rgb(16, 18, 35)')).toBe('colour');
        expect(tokenKind('24px')).toBe('length');
        expect(tokenKind('clamp(32px, 4.4vw, 52px)')).toBe('length');
        expect(tokenKind("'Zilla Slab', Georgia, serif")).toBe('font');
    });

    it('refuses what the engine drops', () => {
        expect(tokenKind('')).toBeNull();
        expect(tokenKind('calc(100% - 2px)')).toBeNull();
        expect(tokenKind('red; background: url(x)')).toBeNull();
        expect(tokenKind('24 px')).toBeNull();
        expect(tokenKind('#'.padEnd(301, 'a'))).toBeNull();
    });
});

describe('token names', () => {
    it('take a letter, then letters, digits and hyphens', () => {
        expect(tokenNameProblem('cms-ink')).toBeNull();
        expect(tokenNameProblem('Accent2')).toBeNull();
        expect(tokenNameProblem('2accent')).not.toBeNull();
        expect(tokenNameProblem('cms_ink')).not.toBeNull();
        expect(tokenNameProblem('a'.repeat(41))).not.toBeNull();
    });

    it('write a row with no name or a repeated name nowhere', () => {
        expect(
            writeTokens([
                { name: 'accent', value: ' #E4572E ' },
                { name: '', value: '24px' },
                { name: 'accent', value: '#000000' },
            ]),
        ).toEqual({ accent: '#E4572E' });
        expect([...repeatedNames(['accent', '', 'accent', 'gutter'])]).toEqual([2]);
    });
});

describe('tones', () => {
    const tokens = { 'cms-ink': '#1D3A8A', 'cms-bg': '#E8EEFD', gutter: '24px' };

    it('refuse a built-in name and an upper case one', () => {
        expect(toneNameProblem('cms')).toBeNull();
        expect(toneNameProblem('accent')).toMatch(/built-in/);
        expect(toneNameProblem('Cms')).not.toBeNull();
    });

    it('resolve a part as a token, then a slot, then a colour written out', () => {
        expect(toneColourProblem('cms-ink', tokens)).toBeNull();
        expect(toneColourProblem('surface', tokens)).toBeNull();
        expect(toneColourProblem('inverse', tokens)).toBeNull();
        expect(toneColourProblem('#B9C8F5', tokens)).toBeNull();
        expect(toneColourProblem('gutter', tokens)).toMatch(/does not hold a colour/);
        expect(toneColourProblem('cms-edge', tokens)).toMatch(/not a token/);
        expect(toneColourProblem('', tokens)).not.toBeNull();
    });

    it('draw a slot the site leaves unset with the fallback, and a role name through its slot', () => {
        const colors = { darkPanel: '#101223' };
        const fallback = (slot: string) => (slot === 'surface' ? '#FFFFFF' : undefined);
        expect(resolveToneColour('cms-ink', tokens, colors, fallback)).toBe('#1D3A8A');
        expect(resolveToneColour('inverse', tokens, colors, fallback)).toBe('#101223');
        expect(resolveToneColour('surface', tokens, colors, fallback)).toBe('#FFFFFF');
        expect(resolveToneColour('gutter', tokens, colors, fallback)).toBeUndefined();
    });

    it('read and write the documented shape', () => {
        const stored = { cms: { ink: 'cms-ink', bg: 'cms-bg', edge: '#B9C8F5' } };
        const rows = readTones(stored);
        expect(rows).toHaveLength(1);
        expect(writeTones(rows!)).toEqual(stored);
        expect(readTones({ cms: { ink: 'x', shade: 'y' } })).toBeNull();
        expect(readTones(['cms'])).toBeNull();
    });

    it('offer only the names a block may store', () => {
        const spec = { ink: '#000', bg: '#fff', edge: '#fff' };
        expect(toneNames({ cms: spec, accent: spec, Press: spec, 'press-dark': spec }, {})).toEqual(['cms', 'press-dark']);
        expect(toneNames(undefined, {})).toEqual([]);
    });

    it('offer no tone whose colours the site cannot resolve', () => {
        const stored = {
            cms: { ink: 'cms-ink', bg: 'cms-bg', edge: '#B9C8F5' },
            ghost: { ink: 'no-such-token', bg: '#fff', edge: '#fff' },
        };
        expect(toneNames(stored, tokens)).toEqual(['cms']);
    });
});

describe('tokensAndTonesProblem', () => {
    const BOTH = { fields: [{ name: 'Tokens' }, { name: 'Tones' }] };

    it('says nothing about a field the site type does not declare, which the screen does not edit', () => {
        const values = { Tokens: { accent: 'url(evil)' }, Tones: { accent: {} } };
        expect(tokensAndTonesProblem(values, { fields: [{ name: 'Name' }] })).toBeNull();
        expect(tokensAndTonesProblem(values, { fields: [{ name: 'Tokens' }] })).toMatch(/A token has/);
        expect(tokensAndTonesProblem(values, { fields: [{ name: 'Tones' }] })).toMatch(/A tone has/);
    });

    it('lets a save through when every token and tone resolves', () => {
        expect(
            tokensAndTonesProblem({
                Tokens: { 'cms-ink': '#1D3A8A', 'cms-bg': '#E8EEFD' },
                Tones: { cms: { ink: 'cms-ink', bg: 'cms-bg', edge: 'hairline' } },
            }, BOTH),
        ).toBeNull();
    });

    it('refuses a token the engine drops', () => {
        expect(tokensAndTonesProblem({ Tokens: { accent: 'url(evil)' } }, BOTH)).toMatch(/A token has a problem/);
    });

    it('refuses a tone naming a token that is not kept', () => {
        expect(
            tokensAndTonesProblem({
                Tokens: { 'cms-ink': 'not a colour;' },
                Tones: { cms: { ink: 'cms-ink', bg: '#FFFFFF', edge: '#FFFFFF' } },
            }, BOTH),
        ).toMatch(/token/);
        expect(
            tokensAndTonesProblem({ Tones: { cms: { ink: 'cms-ink', bg: '#FFFFFF', edge: '#FFFFFF' } } }, BOTH),
        ).toMatch(/A tone has a problem/);
    });

    it('keeps only valid tokens for looking names up', () => {
        expect(validTokens({ good: '#FFFFFF', 'bad name': '#000000', worse: 'x;y' })).toEqual({ good: '#FFFFFF' });
    });
});

describe('withTones', () => {
    const tones = ['page', 'surface', 'accent', 'inverse', 'gradient', 'wash'];
    const schema: BlockSchema = {
        version: 2,
        bindings: null,
        blocks: [
            {
                type: 'section',
                label: 'Section',
                layer: 'primitive',
                perViewer: false,
                fields: [
                    { name: 'tone', kind: 'select', options: tones },
                    { name: 'align', kind: 'select', options: ['start', 'center'] },
                    {
                        name: 'cards',
                        kind: 'list',
                        item: { kind: 'group', fields: [{ name: 'shade', kind: 'select', options: [...tones, 'cms'] }] },
                    },
                ],
            },
        ],
    };

    it('adds the tenant tones to every tone field, nested ones included, once', () => {
        const widened = withTones(schema, ['cms', 'press']);
        const [tone, align, cards] = widened.blocks[0].fields;
        expect(tone.options).toEqual([...tones, 'cms', 'press']);
        expect(align.options).toEqual(['start', 'center']);
        expect(cards.item!.fields![0].options).toEqual([...tones, 'cms', 'press']);
    });

    it('leaves the schema alone when the tenant has no tones', () => {
        expect(withTones(schema, [])).toBe(schema);
    });
});
