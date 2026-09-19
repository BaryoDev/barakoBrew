/**
 * Presets: a tenant's named arrangements of blocks, stored as data in the `Presets` site setting.
 *
 * This is what makes one published barakoPress image serve every site. A designer saves a named
 * block here and every page on that tenant can use it, with no release of the site and no release
 * of this console. barakoPress reads the same setting and compiles each entry into a block its
 * registry offers alongside the ones that are code.
 *
 * The readers below mirror barakoPress `src/blocks/presets.ts`, deliberately. A preset the site
 * would drop has to look dropped here too, or the console offers a block no page can render.
 */

import { readBindings } from '@/lib/bindings';
import type { BlockField, BlockSchema, BlockType } from '@/lib/blocks';

export interface BlockPreset {
    /** The name stored in a page's `type`, for example "band". */
    type: string;
    label: string;
    /** The settings it exposes, read inside `blocks` as `{{props.<name>}}`. */
    fields: BlockField[];
    /** The arrangement, in the same shape a page stores: a list of `{ type, props }`. */
    blocks: unknown;
}

/** The site setting a tenant's presets live in. */
export const PRESETS_FIELD = 'Presets';

/** The most presets one tenant may define, as barakoPress bounds them. */
export const MAX_PRESETS = 60;

/** The kinds a preset may declare a setting as, as barakoPress accepts them. */
export const PRESET_FIELD_KINDS = ['text', 'markdown', 'url', 'number', 'boolean', 'select', 'slots'] as const;

/** Kinds that take a binding unless the preset says otherwise, as barakoPress resolves them. */
const BINDABLE_BY_DEFAULT: ReadonlySet<string> = new Set(['text', 'markdown', 'url', 'select']);

const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPresetName(value: string): boolean {
    return NAME.test(value);
}

/** Null for a field list that is not one, so the preset is dropped rather than exposing no props. */
function fieldsFrom(value: unknown): BlockField[] | null {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return null;
    const fields: BlockField[] = [];
    for (const raw of value.slice(0, 30)) {
        if (!isRecord(raw)) continue;
        const name = typeof raw.name === 'string' ? raw.name : '';
        const kind = typeof raw.kind === 'string' ? raw.kind : '';
        if (!NAME.test(name) || !(PRESET_FIELD_KINDS as readonly string[]).includes(kind)) continue;
        const options = Array.isArray(raw.options)
            ? raw.options.filter((o): o is string => typeof o === 'string').slice(0, 40)
            : undefined;
        if (kind === 'select' && (!options || options.length === 0)) continue;
        fields.push({
            name,
            kind,
            label: typeof raw.label === 'string' ? raw.label : undefined,
            required: raw.required === true,
            options,
            min: typeof raw.min === 'number' ? raw.min : undefined,
            max: typeof raw.max === 'number' ? raw.max : undefined,
            bindable: typeof raw.bindable === 'boolean' ? raw.bindable : undefined,
        });
    }
    return fields;
}

/** The presets a tenant stored, read the way the site reads them: anything misshapen is left out. */
export function presetsFrom(value: unknown): BlockPreset[] {
    if (!Array.isArray(value)) return [];
    const out: BlockPreset[] = [];
    const seen = new Set<string>();
    for (const raw of value.slice(0, MAX_PRESETS)) {
        if (!isRecord(raw)) continue;
        const type = typeof raw.type === 'string' ? raw.type : '';
        if (!NAME.test(type) || seen.has(type)) continue;
        const fields = fieldsFrom(raw.fields);
        if (fields === null) continue;
        seen.add(type);
        out.push({
            type,
            label: typeof raw.label === 'string' && raw.label ? raw.label : type,
            fields,
            blocks: raw.blocks,
        });
    }
    return out;
}

/**
 * A preset as a block the editor offers.
 *
 * `bindable` is worked out the way barakoPress works it out for a field that does not say: every
 * string kind takes a placeholder, a number and a boolean do not. A site that publishes no bindings
 * gets none of them, same as for a block that is code.
 */
export function presetBlockType(preset: BlockPreset, bindings: BlockSchema['bindings']): BlockType {
    return {
        type: preset.type,
        label: preset.label,
        layer: 'preset',
        perViewer: false,
        preset: preset.blocks,
        fields: preset.fields.map((f) => ({
            ...f,
            bindable: bindings !== null && (f.bindable ?? BINDABLE_BY_DEFAULT.has(f.kind)),
        })),
    };
}

/**
 * The site's schema with the tenant's presets added.
 *
 * A preset never replaces a block that is code, the same rule barakoPress applies: a tenant naming
 * one `section` would swap out behaviour the site depends on, and the site would ignore it anyway,
 * so the editor has to ignore it too.
 */
export function withPresets(schema: BlockSchema, presets: readonly BlockPreset[]): BlockSchema {
    if (presets.length === 0) return schema;
    const taken = new Set(schema.blocks.map((b) => b.type));
    const added = presets
        .filter((p) => !taken.has(p.type))
        .map((p) => presetBlockType(p, schema.bindings));
    if (added.length === 0) return schema;
    return { ...schema, blocks: [...schema.blocks, ...added] };
}

/**
 * A preset built from one block and everything inside it.
 *
 * The settings it exposes are the `{{props.X}}` placeholders the blocks already hold, so saving a
 * block whose heading is bound to `props.heading` gives a preset with a Heading setting. Saving one
 * that binds nothing gives a preset with no settings, which is a fixed arrangement, and that is a
 * useful thing to save too.
 */
export function presetFrom(type: string, label: string, blocks: unknown[]): BlockPreset {
    return { type, label, fields: propFields(blocks), blocks };
}

function propFields(value: unknown, into: Map<string, BlockField> = new Map()): BlockField[] {
    if (Array.isArray(value)) {
        for (const entry of value) propFields(entry, into);
    } else if (isRecord(value)) {
        for (const inner of Object.values(value)) propFields(inner, into);
    } else if (typeof value === 'string') {
        for (const binding of readBindings(value)) {
            const name = binding.path.split('.')[0];
            if (binding.scope !== 'props' || !name || into.has(name) || !NAME.test(name)) continue;
            into.set(name, { name, kind: 'text', label: name });
        }
    }
    return [...into.values()];
}

/** The stored list with one preset added or replaced, by name. */
export function upsertPreset(stored: unknown, preset: BlockPreset): BlockPreset[] {
    const presets = presetsFrom(stored);
    const at = presets.findIndex((p) => p.type === preset.type);
    if (at === -1) return [...presets, preset];
    return presets.map((p, i) => (i === at ? preset : p));
}
