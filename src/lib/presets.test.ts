import { describe, expect, it } from 'vitest';
import { parseBlockSchema, type BlockSchema } from './blocks';
import { presetFrom, presetsFrom, upsertPreset, withPresets } from './presets';

const BAND = {
    type: 'band',
    label: 'Band',
    fields: [
        { name: 'heading', kind: 'text', required: true },
        { name: 'tone', kind: 'select', options: ['page', 'accent'] },
    ],
    blocks: [{ type: 'section', props: { tone: '{{props.tone}}' } }],
};

const SCHEMA = parseBlockSchema({
    version: 2,
    bindings: { scopes: ['site', 'props'], formats: ['text', 'upper'] },
    blocks: [
        {
            type: 'section',
            label: 'Section',
            layer: 'primitive',
            fields: [{ name: 'tone', kind: 'select', options: ['page', 'accent'], bindable: true }],
        },
    ],
}) as BlockSchema;

describe('reading the presets a tenant stored', () => {
    it('reads a well formed preset whole', () => {
        const presets = presetsFrom([BAND]);
        expect(presets).toHaveLength(1);
        expect(presets[0]).toMatchObject({ type: 'band', label: 'Band' });
        expect(presets[0].fields.map((f) => f.name)).toEqual(['heading', 'tone']);
    });

    it('drops what the site would drop, rather than offering a block no page can render', () => {
        const presets = presetsFrom([
            { ...BAND, type: '9band' },
            { ...BAND, type: 'ok', fields: 'not a list' },
            { ...BAND, type: 'dupe' },
            { ...BAND, type: 'dupe', label: 'Second' },
            'junk',
        ]);
        expect(presets.map((p) => p.type)).toEqual(['dupe']);
        expect(presets[0].label).toBe('Band');
    });

    it('drops a select with no options, which the site cannot offer a choice from', () => {
        const [preset] = presetsFrom([{ ...BAND, fields: [{ name: 'tone', kind: 'select' }] }]);
        expect(preset.fields).toEqual([]);
    });

    it('reads nothing from a setting that is not a list', () => {
        expect(presetsFrom(undefined)).toEqual([]);
        expect(presetsFrom({ band: BAND })).toEqual([]);
    });
});

describe('adding presets to what the site publishes', () => {
    it('offers each preset as a block in the preset layer, with its own settings', () => {
        const merged = withPresets(SCHEMA, presetsFrom([BAND]));
        expect(merged.blocks).toHaveLength(2);
        const band = merged.blocks.find((b) => b.type === 'band')!;
        expect(band.layer).toBe('preset');
        expect(band.fields.map((f) => f.name)).toEqual(['heading', 'tone']);
    });

    it('binds a preset string setting, because that is how a preset passes a tone through', () => {
        const band = withPresets(SCHEMA, presetsFrom([BAND])).blocks.find((b) => b.type === 'band')!;
        expect(band.fields.find((f) => f.name === 'heading')!.bindable).toBe(true);
        expect(band.fields.find((f) => f.name === 'tone')!.bindable).toBe(true);
    });

    it('binds nothing on a site that publishes no bindings, whatever the preset says', () => {
        const v1 = parseBlockSchema({ version: 1, blocks: [] }) as BlockSchema;
        const band = withPresets(v1, presetsFrom([BAND])).blocks.find((b) => b.type === 'band')!;
        expect(band.fields).toHaveLength(2);
        expect(band.fields.every((f) => f.bindable === false)).toBe(true);
    });

    it('never lets a preset replace a block that is code, the way the site never does', () => {
        const merged = withPresets(SCHEMA, presetsFrom([{ ...BAND, type: 'section', label: 'Mine' }]));
        expect(merged.blocks).toHaveLength(1);
        expect(merged.blocks[0].label).toBe('Section');
    });
});

describe('saving a block as a preset', () => {
    it('declares a setting for each props binding the block already holds', () => {
        const preset = presetFrom('band', 'Band', [
            { type: 'section', props: { tone: '{{props.tone}}', content: [[{ type: 'text', props: { value: '{{props.heading}}' } }]] } },
        ]);
        expect(preset.fields.map((f) => f.name)).toEqual(['tone', 'heading']);
        expect(preset.fields.every((f) => f.kind === 'text')).toBe(true);
    });

    it('declares nothing for a binding to another scope, which resolves where the preset is used', () => {
        const preset = presetFrom('band', 'Band', [{ type: 'text', props: { value: '{{site.Name}}' } }]);
        expect(preset.fields).toEqual([]);
        expect(preset.blocks).toEqual([{ type: 'text', props: { value: '{{site.Name}}' } }]);
    });

    it('replaces a preset of the same name rather than storing it twice', () => {
        const first = presetFrom('band', 'Band', [{ type: 'text', props: {} }]);
        const second = presetFrom('band', 'Wide band', [{ type: 'section', props: {} }]);
        const stored = upsertPreset(upsertPreset([], first), second);
        expect(stored).toHaveLength(1);
        expect(stored[0].label).toBe('Wide band');
    });

    it('keeps the presets already stored when it adds one', () => {
        const stored = upsertPreset([BAND], presetFrom('tiers', 'Tiers', []));
        expect(stored.map((p) => p.type)).toEqual(['band', 'tiers']);
    });
});
