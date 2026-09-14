/**
 * The block model a site renders a page from, and the operations the block editor performs on it.
 *
 * A page holds an ordered list of `{ type, props }` in a json field. barakoPress publishes what it
 * can render at `GET /api/blocks` as `{ version: 1, blocks: [{ type, label, perViewer, fields }] }`,
 * and this console builds the editor from that document alone. It knows nothing about any site.
 *
 * Every operation keeps what it does not understand. A block whose type the schema does not list, a
 * prop no field declares, and a key beside `type` and `props` all survive an edit and a save.
 */

import type { FieldDefinition } from '@/types/schema';

export type BlockFieldKind = 'text' | 'markdown' | 'url' | 'number' | 'boolean' | 'select' | 'slots';

export interface BlockField {
    name: string;
    /** A kind this console does not know is kept as the string the site sent. */
    kind: BlockFieldKind | (string & {});
    label?: string;
    required?: boolean;
    options?: string[];
    min?: number;
    max?: number;
}

export interface BlockType {
    type: string;
    label: string;
    perViewer: boolean;
    fields: BlockField[];
}

export interface BlockSchema {
    version: 1;
    blocks: BlockType[];
}

export type BlockItem = Record<string, unknown>;

/** The site's own bounds, from barakoPress: blocks read in the whole tree, and lists deep. */
export const MAX_BLOCKS = 100;
export const MAX_DEPTH = 4;

/** The json field that holds a page's blocks, by the name barakoPress reads by default. */
export function isBlocksField(fieldName: string): boolean {
    return fieldName.toLowerCase() === 'blocks';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * The schema a site published, or null when the document is not one this console can build from.
 *
 * A version other than 1 is refused whole, since a later shape may mean something different by the
 * same keys. Within version 1, an entry with no type or a field with no name is skipped rather than
 * failing everything else.
 */
export function parseBlockSchema(raw: unknown): BlockSchema | null {
    if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.blocks)) return null;
    const blocks: BlockType[] = [];
    const seen = new Set<string>();
    for (const entry of raw.blocks) {
        if (!isRecord(entry) || typeof entry.type !== 'string' || !entry.type || seen.has(entry.type)) continue;
        seen.add(entry.type);
        const fields: BlockField[] = [];
        for (const f of Array.isArray(entry.fields) ? entry.fields : []) {
            if (!isRecord(f) || typeof f.name !== 'string' || !f.name || typeof f.kind !== 'string') continue;
            fields.push({
                name: f.name,
                kind: f.kind,
                label: typeof f.label === 'string' ? f.label : undefined,
                required: f.required === true,
                options: Array.isArray(f.options) ? f.options.filter((o): o is string => typeof o === 'string') : undefined,
                min: finite(f.min),
                max: finite(f.max),
            });
        }
        blocks.push({
            type: entry.type,
            label: typeof entry.label === 'string' && entry.label ? entry.label : entry.type,
            perViewer: entry.perViewer === true,
            fields,
        });
    }
    return { version: 1, blocks };
}

/** A stored value as a list of blocks. Nothing stored reads as empty; anything but a list is null. */
export function readBlocks(value: unknown): unknown[] | null {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : null;
}

export function blockTypeOf(item: unknown): string | null {
    return isRecord(item) && typeof item.type === 'string' ? item.type : null;
}

export function propsOf(item: unknown): Record<string, unknown> {
    return isRecord(item) && isRecord(item.props) ? item.props : {};
}

/** The schema's entry for a stored block, or null when the site cannot render that type. */
export function definitionFor(schema: BlockSchema, item: unknown): BlockType | null {
    const type = blockTypeOf(item);
    if (type === null) return null;
    return schema.blocks.find((b) => b.type === type) ?? null;
}

/*
 * A stable key per stored block, for React. Blocks carry no id, and an index key would hand one
 * block's half-typed JSON or open preview tab to its neighbour after a move. The key follows the
 * object, and `replaced` carries it onto the copy an edit makes.
 */
const keys = new WeakMap<object, string>();
let nextKey = 0;

export function blockKey(item: unknown, index: number): string {
    if (typeof item !== 'object' || item === null) return `value-${index}`;
    let key = keys.get(item);
    if (!key) {
        key = `block-${++nextKey}`;
        keys.set(item, key);
    }
    return key;
}

function replaced<T extends object>(previous: unknown, next: T): T {
    if (typeof previous === 'object' && previous !== null) {
        const key = keys.get(previous);
        if (key) keys.set(next, key);
    }
    return next;
}

/** A new block of a type, with as many empty lists as each `slots` field needs at least. */
export function newBlock(type: BlockType): BlockItem {
    const props: Record<string, unknown> = {};
    for (const field of type.fields) {
        if (field.kind === 'slots') {
            props[field.name] = Array.from({ length: Math.max(field.min ?? 1, 1) }, () => []);
        }
    }
    return { type: type.type, props };
}

/**
 * The block with one prop set. Every other key on the block and in its props is kept. An empty value
 * removes the prop, which is how the site reads it anyway: null and "" count as absent.
 */
export function setProp(item: unknown, name: string, value: unknown): BlockItem {
    const base = isRecord(item) ? item : {};
    const props = { ...propsOf(item) };
    if (value === undefined || value === null || value === '') delete props[name];
    else props[name] = value;
    return replaced(item, { ...base, props });
}

export function insertAt<T>(list: readonly T[], index: number, item: T): T[] {
    const next = [...list];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
    return next;
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
    return list.filter((_, i) => i !== index);
}

/** The list with one entry moved from `from` to sit at `to`. Out-of-range moves return the list. */
export function move<T>(list: T[], from: number, to: number): T[] {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

/**
 * Where a dragged entry lands when dropped on the top or bottom half of another. Dropping below the
 * entry above, or above the entry below, is no move at all.
 */
export function dropIndex(from: number, target: number, edge: 'top' | 'bottom'): number {
    const slot = edge === 'top' ? target : target + 1;
    return slot > from ? slot - 1 : slot;
}

/** The block with one list of one `slots` field replaced. */
export function setSlotList(item: unknown, field: string, index: number, list: unknown[]): BlockItem {
    const lists = slotLists(item, field);
    const next = lists.map((l, i) => (i === index ? list : l));
    return setProp(item, field, next);
}

export function slotLists(item: unknown, field: string): unknown[][] {
    const value = propsOf(item)[field];
    return Array.isArray(value) ? value.map((l) => (Array.isArray(l) ? l : [])) : [];
}

const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

/** The same test barakoPress applies to a url prop before it renders a link. */
export function isSafeHref(href: string): boolean {
    const trimmed = href.trim();
    if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true;
    try {
        return SAFE_SCHEMES.includes(new URL(trimmed).protocol);
    } catch {
        return false;
    }
}

function bounds(field: BlockField): string {
    const { min, max } = field;
    if (min !== undefined && max !== undefined) return ` from ${min} to ${max}`;
    if (min !== undefined) return ` of at least ${min}`;
    if (max !== undefined) return ` of at most ${max}`;
    return '';
}

function inRange(field: BlockField, n: number) {
    return (field.min === undefined || n >= field.min) && (field.max === undefined || n <= field.max);
}

/**
 * What is wrong with each prop of a block, by field name, checked the way barakoPress checks it.
 *
 * The site skips a block with any wrong prop, required or not, so these are what would make it
 * disappear from the page. A kind this console does not know is not checked.
 */
export function validateBlock(type: BlockType, item: unknown): Record<string, string> {
    const props = propsOf(item);
    const errors: Record<string, string> = {};
    for (const field of type.fields) {
        const value = props[field.name];
        if (value === undefined || value === null || value === '') {
            if (field.required) errors[field.name] = 'Required. The site does not show this block without it.';
            continue;
        }
        const message = problem(field, value);
        if (message) errors[field.name] = message;
    }
    return errors;
}

function problem(field: BlockField, value: unknown): string | null {
    switch (field.kind) {
        case 'text':
        case 'markdown':
            return typeof value === 'string' ? null : 'Has to be text.';
        case 'url':
            return typeof value === 'string' && isSafeHref(value)
                ? null
                : 'Has to be a link starting with /, #, http:, https: or mailto:.';
        case 'boolean':
            return typeof value === 'boolean' ? null : 'Has to be on or off.';
        case 'number':
            return typeof value === 'number' && Number.isFinite(value) && inRange(field, value)
                ? null
                : `Has to be a number${bounds(field)}.`;
        case 'select':
            return typeof value === 'string' && (field.options ?? []).includes(value)
                ? null
                : `Has to be one of: ${(field.options ?? []).join(', ')}.`;
        case 'slots':
            return Array.isArray(value) && value.every(Array.isArray) && inRange(field, value.length)
                ? null
                : `Has to be a number of lists${bounds(field)}.`;
        default:
            return null;
    }
}

/** Every block in a list, nested ones included, counted the way the site spends its budget. */
export function countBlocks(schema: BlockSchema, list: readonly unknown[]): number {
    let total = 0;
    for (const item of list) {
        total++;
        const type = definitionFor(schema, item);
        if (!type) continue;
        for (const field of type.fields) {
            if (field.kind !== 'slots') continue;
            for (const inner of slotLists(item, field.name)) total += countBlocks(schema, inner);
        }
    }
    return total;
}

/**
 * A block prop as a console field definition, so the same controls the entry form uses edit it.
 * `id` becomes the control's id, which has to be unique on the page while the prop name is not.
 * Null for a kind the entry form has no control for.
 */
export function fieldDefinitionFor(field: BlockField, id: string): FieldDefinition | null {
    const type = FIELD_TYPES[field.kind as Exclude<BlockFieldKind, 'select' | 'slots'>];
    if (!type) return null;
    return { name: id, displayName: field.label || field.name, type, isRequired: field.required === true };
}

const FIELD_TYPES: Record<Exclude<BlockFieldKind, 'select' | 'slots'>, FieldDefinition['type']> = {
    text: 'string',
    markdown: 'markdown',
    url: 'url',
    number: 'decimal',
    boolean: 'bool',
};

/** What to call a block in a list: its label, and the first short text it holds. */
export function blockSummary(type: BlockType, item: unknown): string {
    const props = propsOf(item);
    for (const field of type.fields) {
        const value = props[field.name];
        if ((field.kind === 'text' || field.kind === 'select') && typeof value === 'string' && value.trim()) {
            const text = value.trim();
            return text.length > 60 ? `${text.slice(0, 57)}...` : text;
        }
    }
    return '';
}
