import { describe, expect, it } from 'vitest';
import {
    blockKey,
    countBlocks,
    dropIndex,
    fieldDefinitionFor,
    fieldProblem,
    isBindable,
    isStructured,
    MAX_LIST_ITEMS,
    move,
    newBlock,
    newListEntry,
    parseBlockSchema,
    setProp,
    setSlotList,
    validateBlock,
    type BlockSchema,
} from './blocks';

/** What barakoPress's `blockSchema` returns for its built-in blocks, copied from its output. */
const PUBLISHED = {
    version: 1,
    blocks: [
        {
            type: 'richText',
            label: 'Rich text',
            perViewer: false,
            fields: [{ name: 'markdown', kind: 'markdown', label: 'Text', required: true }],
        },
        {
            type: 'image',
            label: 'Image',
            perViewer: false,
            fields: [
                { name: 'src', kind: 'url', label: 'Image URL', required: true },
                { name: 'alt', kind: 'text', label: 'Alternative text' },
                { name: 'caption', kind: 'text', label: 'Caption' },
            ],
        },
        {
            type: 'columns',
            label: 'Columns',
            perViewer: false,
            fields: [{ name: 'columns', kind: 'slots', label: 'Columns', required: true, min: 1, max: 4 }],
        },
        {
            type: 'collection',
            label: 'Collection',
            perViewer: false,
            fields: [
                { name: 'collection', kind: 'select', label: 'Collection', required: true, options: ['post', 'author'] },
                { name: 'limit', kind: 'number', label: 'How many', min: 1, max: 24 },
                { name: 'featured', kind: 'boolean', label: 'Featured only' },
                { name: 'heading', kind: 'text', label: 'Heading' },
            ],
        },
    ],
};

const schema = parseBlockSchema(PUBLISHED) as BlockSchema;
const byType = (type: string) => schema.blocks.find((b) => b.type === type)!;

describe('reading a published block schema', () => {
    it('keeps every block and field the site published', () => {
        expect(schema.blocks.map((b) => b.type)).toEqual(['richText', 'image', 'columns', 'collection']);
        expect(byType('columns').fields[0]).toMatchObject({ kind: 'slots', min: 1, max: 4, required: true });
        expect(byType('collection').fields[0].options).toEqual(['post', 'author']);
    });

    it('refuses a version it does not know, rather than guessing what the keys mean', () => {
        expect(parseBlockSchema({ ...PUBLISHED, version: 3 })).toBeNull();
        expect(parseBlockSchema([])).toBeNull();
        expect(parseBlockSchema({ version: 1 })).toBeNull();
    });

    it('skips a malformed entry and keeps the rest', () => {
        const parsed = parseBlockSchema({
            version: 1,
            blocks: [
                { label: 'no type' },
                { type: 'hero', fields: [{ kind: 'text' }, { name: 'title', kind: 'text' }] },
            ],
        })!;
        expect(parsed.blocks).toHaveLength(1);
        expect(parsed.blocks[0]).toMatchObject({ type: 'hero', label: 'hero', perViewer: false });
        expect(parsed.blocks[0].fields.map((f) => f.name)).toEqual(['title']);
    });
});

describe('a block prop as a console field', () => {
    it('maps each value kind to the control the entry form already has', () => {
        const kinds = { text: 'string', markdown: 'markdown', url: 'url', number: 'decimal', boolean: 'bool' };
        for (const [kind, type] of Object.entries(kinds)) {
            expect(fieldDefinitionFor({ name: 'x', kind, label: 'X', required: true }, 'b1-x')).toEqual({
                name: 'b1-x',
                displayName: 'X',
                type,
                isRequired: true,
            });
        }
    });

    it('has no form field for a select, a slots field or a kind it does not know', () => {
        expect(fieldDefinitionFor({ name: 'x', kind: 'select', options: ['a'] }, 'id')).toBeNull();
        expect(fieldDefinitionFor({ name: 'x', kind: 'slots' }, 'id')).toBeNull();
        expect(fieldDefinitionFor({ name: 'x', kind: 'colour' }, 'id')).toBeNull();
    });
});

describe('reordering', () => {
    it('moves an entry to the position asked for', () => {
        expect(move(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
        expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
        expect(move(['a', 'b', 'c'], 1, 0)).toEqual(['b', 'a', 'c']);
    });

    it('returns the same list for a move that goes nowhere', () => {
        const list = ['a', 'b'];
        expect(move(list, 0, 0)).toBe(list);
        expect(move(list, 1, 2)).toBe(list);
        expect(move(list, -1, 0)).toBe(list);
    });

    it('lands a drop on the side of the target it was dropped on', () => {
        // Dragging a down the list of a b c d.
        expect(dropIndex(0, 2, 'top')).toBe(1);
        expect(dropIndex(0, 2, 'bottom')).toBe(2);
        // Dragging d up.
        expect(dropIndex(3, 1, 'top')).toBe(1);
        expect(dropIndex(3, 1, 'bottom')).toBe(2);
        // Just below the entry above it, or just above the entry below it: no move.
        expect(dropIndex(2, 1, 'bottom')).toBe(2);
        expect(dropIndex(2, 3, 'top')).toBe(2);
    });
});

describe('editing a block keeps what the editor does not understand', () => {
    it('keeps undeclared props and keys beside type and props', () => {
        const stored = { type: 'image', id: 'hero-1', props: { src: '/a.png', focalPoint: [0.5, 0.2] } };
        const edited = setProp(stored, 'alt', 'A harbour');
        expect(edited).toEqual({
            type: 'image',
            id: 'hero-1',
            props: { src: '/a.png', focalPoint: [0.5, 0.2], alt: 'A harbour' },
        });
        expect(stored.props).not.toHaveProperty('alt');
    });

    it('removes a prop set to empty, which the site reads as absent anyway', () => {
        expect(setProp({ type: 'image', props: { src: '/a.png', alt: 'A' } }, 'alt', '')).toEqual({
            type: 'image',
            props: { src: '/a.png' },
        });
    });

    it('keeps a block its React key through an edit, so its controls are not remounted', () => {
        const stored = { type: 'image', props: {} };
        const key = blockKey(stored, 0);
        const edited = setProp(stored, 'src', '/b.png');
        expect(edited).not.toBe(stored);
        expect(blockKey(edited, 5)).toBe(key);
        expect(blockKey({ type: 'image', props: {} }, 0)).not.toBe(key);
    });

    it('replaces one nested list and leaves the others as they were', () => {
        const left = [{ type: 'richText', props: { markdown: 'left' } }];
        const right = [{ type: 'pricing', props: { plan: 'Pro' } }];
        const columns = { type: 'columns', props: { columns: [left, right] } };
        const next = setSlotList(columns, 'columns', 0, []);
        expect(next.props).toEqual({ columns: [[], right] });
        expect((next.props as { columns: unknown[][] }).columns[1]).toBe(right);
    });

    it('starts a new columns block with the one list it needs', () => {
        expect(newBlock(byType('columns'))).toEqual({ type: 'columns', props: { columns: [[]] } });
        expect(newBlock(byType('image'))).toEqual({ type: 'image', props: {} });
    });
});

describe('validating a block against the schema', () => {
    it('reports a missing required prop', () => {
        expect(validateBlock(schema, byType('image'), { type: 'image', props: { alt: 'A' } })).toEqual({
            src: 'Required. The site does not show this block without it.',
        });
    });

    it('refuses a link the site would refuse to render', () => {
        const errors = validateBlock(schema, byType('image'), { type: 'image', props: { src: 'javascript:alert(1)' } });
        expect(Object.keys(errors)).toEqual(['src']);
        expect(errors.src).toMatch(/link/);
        expect(validateBlock(schema, byType('image'), { type: 'image', props: { src: 'https://x.test/a.png' } })).toEqual({});
        expect(validateBlock(schema, byType('image'), { type: 'image', props: { src: '/a.png' } })).toEqual({});
    });

    it('checks a number against its range, a select against its options and a type against its kind', () => {
        const errors = validateBlock(schema, byType('collection'), {
            type: 'collection',
            props: { collection: 'category', limit: 30, featured: 'yes', heading: 42 },
        });
        expect(errors).toEqual({
            collection: 'Has to be one of: post, author.',
            limit: 'Has to be a number from 1 to 24.',
            featured: 'Has to be on or off.',
            heading: 'Has to be text.',
        });
    });

    it('checks how many lists a slots field holds', () => {
        const five = { type: 'columns', props: { columns: [[], [], [], [], []] } };
        expect(validateBlock(schema, byType('columns'), five)).toEqual({ columns: 'Has to be a number of lists from 1 to 4.' });
        expect(validateBlock(schema, byType('columns'), { type: 'columns', props: { columns: [[], []] } })).toEqual({});
    });

    it('does not check a kind this console does not know', () => {
        const type = parseBlockSchema({
            version: 1,
            blocks: [{ type: 'map', fields: [{ name: 'at', kind: 'geopoint', required: true }] }],
        })!.blocks[0];
        expect(validateBlock(schema, type, { type: 'map', props: { at: { lat: 1, lng: 2 } } })).toEqual({});
        expect(validateBlock(schema, type, { type: 'map', props: {} })).toHaveProperty('at');
    });
});

describe('counting blocks the way the site spends its budget', () => {
    it('counts nested blocks and blocks of unknown types', () => {
        const list = [
            { type: 'richText', props: { markdown: 'a' } },
            { type: 'columns', props: { columns: [[{ type: 'image', props: {} }], [{ type: 'pricing' }, 'junk']] } },
            { type: 'pricing', props: {} },
        ];
        expect(countBlocks(schema, list)).toBe(6);
    });
});

/** What barakoPress publishes from the branch that adds bindings, presets and layers. */
const PUBLISHED_V2 = {
    version: 2,
    bindings: {
        scopes: ['site', 'page', 'item', 'query', 'props'],
        formats: ['text', 'date', 'datetime', 'time', 'money', 'number', 'upper', 'lower'],
    },
    blocks: [
        {
            type: 'text',
            label: 'Text',
            layer: 'primitive',
            perViewer: false,
            fields: [
                { name: 'value', kind: 'text', required: true, bindable: true },
                { name: 'variant', kind: 'select', options: ['meta', 'title'], bindable: true },
            ],
        },
        {
            type: 'link',
            label: 'Link',
            layer: 'primitive',
            perViewer: false,
            fields: [{ name: 'href', kind: 'url', required: true, bindable: true }],
        },
        {
            type: 'source',
            label: 'Load content',
            layer: 'data',
            perViewer: false,
            fields: [
                { name: 'collection', kind: 'select', required: true, options: ['post'], bindable: true },
                { name: 'pageSize', kind: 'number', min: 1, max: 50, bindable: false },
            ],
        },
    ],
};

const v2 = parseBlockSchema(PUBLISHED_V2) as BlockSchema;

describe('reading a version 2 schema, which adds keys to version 1', () => {
    it('reads the scopes and formats the site published, and does not invent any', () => {
        expect(v2.version).toBe(2);
        expect(v2.bindings).toEqual(PUBLISHED_V2.bindings);
    });

    it('reads the layer each block belongs to', () => {
        expect(v2.blocks.map((b) => b.layer)).toEqual(['primitive', 'primitive', 'data']);
    });

    it('reads bindable per field, and is not fooled by a number that says it is', () => {
        const source = v2.blocks.find((b) => b.type === 'source')!;
        expect(isBindable(v2, source.fields[0])).toBe(true);
        expect(isBindable(v2, source.fields[1])).toBe(false);
    });

    it('publishes no bindings for a version 1 site, so no field takes one', () => {
        expect(schema.bindings).toBeNull();
        const image = byType('image');
        expect(image.fields.every((f) => !isBindable(schema, f))).toBe(true);
        expect(image.fields.length).toBeGreaterThan(0);
    });

    it('reads no bindings from a version 1 document claiming a bindable field', () => {
        const parsed = parseBlockSchema({
            version: 1,
            blocks: [{ type: 'text', fields: [{ name: 'value', kind: 'text', bindable: true }] }],
        })!;
        expect(parsed.bindings).toBeNull();
        expect(parsed.blocks[0].fields[0].bindable).toBe(false);
        expect(isBindable(parsed, { name: 'value', kind: 'text', bindable: true })).toBe(false);
        expect(isBindable(v2, { name: 'value', kind: 'text', bindable: true })).toBe(true);
    });

    it('reads no bindings from a version 2 document whose bindings are not a shape it can use', () => {
        expect(parseBlockSchema({ version: 2, bindings: { scopes: [] }, blocks: [] })!.bindings).toBeNull();
        expect(parseBlockSchema({ version: 2, blocks: [] })!.bindings).toBeNull();
    });

    it('gives every block of a version 1 site the same layer, so the palette shows one group', () => {
        expect(new Set(schema.blocks.map((b) => b.layer))).toEqual(new Set(['block']));
    });
});

describe('validating a prop that holds a binding', () => {
    it('accepts a link that is a binding, since what it resolves to is checked on the server', () => {
        expect(validateBlock(v2, byTypeIn(v2, 'link'), { type: 'link', props: { href: '{{item.Url}}' } })).toEqual({});
    });

    it('refuses a link prefixed with a scheme the site refuses, binding or not', () => {
        const errors = validateBlock(v2, byTypeIn(v2, 'link'), {
            type: 'link',
            props: { href: 'javascript:{{item.Url}}' },
        });
        expect(errors.href).toMatch(/link/);
    });

    it('accepts a select holding a binding, because a preset passes a tone through as text', () => {
        expect(validateBlock(v2, byTypeIn(v2, 'text'), { type: 'text', props: { value: 'x', variant: '{{props.tone}}' } })).toEqual(
            {},
        );
    });

    it('refuses a select holding text that is not a binding and not an option', () => {
        const errors = validateBlock(v2, byTypeIn(v2, 'text'), { type: 'text', props: { value: 'x', variant: 'huge' } });
        expect(errors.variant).toMatch(/one of/);
    });

    it('checks a bound value literally on a site that publishes no bindings, since it renders it literally', () => {
        const v1 = parseBlockSchema({
            version: 1,
            blocks: [{ type: 'link', fields: [{ name: 'href', kind: 'url', required: true }] }],
        })!;
        const errors = validateBlock(v1, v1.blocks[0], { type: 'link', props: { href: '{{item.Url}}' } });
        expect(errors.href).toMatch(/link/);
    });
});

function byTypeIn(from: BlockSchema, type: string) {
    return from.blocks.find((b) => b.type === type)!;
}

/** barakoPress's list and group fields, as its `/api/blocks` publishes the `stages` test block. */
const PUBLISHED_LISTS = {
    version: 2,
    bindings: { scopes: ['site', 'page', 'item'], formats: ['text'] },
    blocks: [
        {
            type: 'stages',
            label: 'Stages',
            layer: 'block',
            perViewer: false,
            fields: [
                { name: 'heading', kind: 'text', bindable: true },
                {
                    name: 'stages',
                    kind: 'list',
                    label: 'Stages',
                    required: true,
                    min: 2,
                    max: 5,
                    bindable: true,
                    item: {
                        kind: 'group',
                        label: 'Stage',
                        bindable: true,
                        fields: [
                            { name: 'label', kind: 'text', required: true, bindable: true },
                            { name: 'body', kind: 'markdown', bindable: true },
                            { name: 'href', kind: 'url', bindable: true },
                        ],
                    },
                },
                { name: 'tags', kind: 'list', max: 3, bindable: true, item: { kind: 'text', bindable: true } },
                { name: 'scores', kind: 'list', bindable: true, item: { kind: 'number', min: 0, max: 10, bindable: false } },
                {
                    name: 'lead',
                    kind: 'group',
                    bindable: true,
                    fields: [
                        { name: 'label', kind: 'text', required: true, bindable: true },
                        { name: 'href', kind: 'url', bindable: true },
                    ],
                },
            ],
        },
    ],
};

const lists = parseBlockSchema(PUBLISHED_LISTS) as BlockSchema;
const stagesType = lists.blocks[0];
const fieldOf = (name: string) => stagesType.fields.find((f) => f.name === name)!;

describe('reading list and group fields', () => {
    it('reads a list item, with its kind, label, range, fields and bindability', () => {
        const stages = fieldOf('stages');
        expect(stages).toMatchObject({ kind: 'list', required: true, min: 2, max: 5, bindable: true });
        expect(stages.item).toMatchObject({ kind: 'group', label: 'Stage', bindable: true });
        expect(stages.item!.fields!.map((f) => [f.name, f.kind, f.required, f.bindable])).toEqual([
            ['label', 'text', true, true],
            ['body', 'markdown', false, true],
            ['href', 'url', false, true],
        ]);
        expect(fieldOf('scores').item).toMatchObject({ kind: 'number', min: 0, max: 10, bindable: false });
    });

    it('reads a group and its fields', () => {
        const lead = fieldOf('lead');
        expect(lead.kind).toBe('group');
        expect(lead.fields!.map((f) => f.name)).toEqual(['label', 'href']);
    });

    it('reads no bindability inside a list on a site that publishes no bindings', () => {
        const v1 = parseBlockSchema({ ...PUBLISHED_LISTS, version: 1 })!;
        const stages = v1.blocks[0].fields.find((f) => f.name === 'stages')!;
        expect(stages.item!.fields).toHaveLength(3);
        expect(stages.bindable).toBe(false);
        expect(stages.item!.bindable).toBe(false);
        expect(stages.item!.fields!.every((f) => f.bindable === false)).toBe(true);
    });

    it('leaves a list with no item, or an item kind it does not know, as a field it edits as JSON', () => {
        const parsed = parseBlockSchema({
            version: 2,
            blocks: [
                {
                    type: 'odd',
                    fields: [
                        { name: 'a', kind: 'list' },
                        { name: 'b', kind: 'list', item: { kind: 'slots' } },
                        { name: 'c', kind: 'group' },
                        { name: 'd', kind: 'list', item: { kind: 'group' } },
                        { name: 'e', kind: 'list', item: { kind: 'url' } },
                    ],
                },
            ],
        })!;
        const editable = parsed.blocks[0].fields.map((f) => [f.name, isStructured(f)]);
        expect(editable).toEqual([
            ['a', false],
            ['b', false],
            ['c', false],
            ['d', false],
            ['e', true],
        ]);
    });

    it('reads lists and groups three deep and no deeper, which is as deep as the site nests them', () => {
        const deep = (depth: number): Record<string, unknown> =>
            depth === 0
                ? { name: 'leaf', kind: 'text' }
                : { name: `g${depth}`, kind: 'group', fields: [deep(depth - 1)] };
        const parsed = parseBlockSchema({ version: 2, blocks: [{ type: 'deep', fields: [deep(4)] }] })!;
        const g4 = parsed.blocks[0].fields[0];
        const g3 = g4.fields![0];
        const g2 = g3.fields![0];
        expect([isStructured(g4), isStructured(g3), isStructured(g2)]).toEqual([true, true, true]);
        expect(g2.fields![0]).toMatchObject({ name: 'g1', kind: 'group' });
        expect(isStructured(g2.fields![0])).toBe(false);
    });

    it('counts a list of groups once toward the depth', () => {
        const parsed = parseBlockSchema({
            version: 2,
            blocks: [
                {
                    type: 'path',
                    fields: [
                        {
                            name: 'stages',
                            kind: 'list',
                            item: {
                                kind: 'group',
                                fields: [
                                    {
                                        name: 'links',
                                        kind: 'list',
                                        item: { kind: 'group', fields: [{ name: 'tags', kind: 'list', item: { kind: 'text' } }] },
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        })!;
        const links = parsed.blocks[0].fields[0].item!.fields![0];
        expect(isStructured(links)).toBe(true);
        expect(isStructured(links.item!.fields![0])).toBe(true);
    });

    it('reads a schema with no list or group exactly as before', () => {
        const before = parseBlockSchema(PUBLISHED)!;
        for (const field of before.blocks.flatMap((b) => b.fields)) {
            expect(Object.keys(field).sort()).toEqual(
                ['bindable', 'kind', 'label', 'max', 'min', 'name', 'options', 'required'].sort(),
            );
        }
        expect(before.blocks.flatMap((b) => b.fields)).toHaveLength(9);
    });
});

const FIVE_STAGES = [1, 2, 3, 4, 5].map((n) => ({ label: `Stage ${n}` }));

describe('validating list and group values the way the site does', () => {
    const check = (props: Record<string, unknown>) => validateBlock(lists, stagesType, { type: 'stages', props });

    it('accepts a list within its range whose every entry passes', () => {
        expect(check({ stages: FIVE_STAGES, tags: ['a', 'b'], scores: [0, 10], lead: { label: 'Go', href: '/go' } })).toEqual({});
    });

    it('reads an empty required list as missing', () => {
        expect(check({ stages: [] }).stages).toBe('Required. The site does not show this block without it.');
    });

    it('refuses a list shorter than its minimum or longer than its maximum', () => {
        expect(check({ stages: [{ label: 'Only' }] }).stages).toBe('Has to hold from 2 to 5 entries.');
        expect(check({ stages: [...FIVE_STAGES, { label: 'Six' }] }).stages).toBe('Has to hold from 2 to 5 entries.');
        expect(check({ stages: FIVE_STAGES, tags: ['a', 'b', 'c', 'd'] }).tags).toBe('Has to hold at most 3 entries.');
    });

    it('holds a list with no maximum to the hundred entries the site reads', () => {
        const many = Array.from({ length: MAX_LIST_ITEMS + 1 }, () => 1);
        expect(check({ stages: FIVE_STAGES, scores: many }).scores).toBe(`Has to hold at most ${MAX_LIST_ITEMS} entries.`);
    });

    it('names the entry that fails and why', () => {
        expect(check({ stages: FIVE_STAGES, scores: [3, 11] }).scores).toBe('Entry 2: Has to be a number from 0 to 10.');
        expect(check({ stages: [{ label: 'One' }, { body: 'no label' }] }).stages).toBe(
            'Entry 2: label: Required. The site does not show this block without it.',
        );
        expect(check({ stages: [{ label: 'One' }, { label: 'Two', href: 'javascript:alert(1)' }] }).stages).toMatch(
            /^Entry 2: href: Has to be a link/,
        );
    });

    it('refuses a value that is not a list, or a group that is not an object', () => {
        expect(check({ stages: FIVE_STAGES, tags: 'a,b' }).tags).toBe('Has to be a list.');
        expect(check({ stages: FIVE_STAGES, lead: ['Go'] }).lead).toBe('Has to be a group of values.');
        expect(check({ stages: FIVE_STAGES, lead: { href: '/go' } }).lead).toBe(
            'label: Required. The site does not show this block without it.',
        );
    });

    it('accepts a whole list or group bound to data on a site that renders bindings', () => {
        expect(check({ stages: '{{item.Stages}}', lead: '{{site.Lead}}' })).toEqual({});
        expect(check({ stages: FIVE_STAGES, tags: ['{{item.Tag}}'] })).toEqual({});
        expect(check({ stages: FIVE_STAGES, tags: ['a {{item.Tag}}', 'plain'] })).toEqual({});
    });

    it('refuses a bound list on a site that renders no bindings, since it would print the braces', () => {
        const v1 = parseBlockSchema({ ...PUBLISHED_LISTS, version: 1 })!;
        expect(validateBlock(v1, v1.blocks[0], { type: 'stages', props: { stages: '{{item.Stages}}' } }).stages).toBe(
            'Has to be a list.',
        );
    });

    it('gives each nested value its own message, for the field that holds it', () => {
        const stage = fieldOf('stages').item!.fields!;
        expect(fieldProblem(lists, stage[0], undefined)).toBe('Required. The site does not show this block without it.');
        expect(fieldProblem(lists, stage[2], 'javascript:x')).toMatch(/link/);
        expect(fieldProblem(lists, stage[2], undefined)).toBeNull();
    });
});

describe('new list entries', () => {
    it('starts each entry as the most empty value of its kind', () => {
        expect(newListEntry(fieldOf('tags').item!)).toBe('');
        expect(newListEntry(fieldOf('scores').item!)).toBe(0);
        expect(newListEntry(fieldOf('stages').item!)).toEqual({});
    });
});
