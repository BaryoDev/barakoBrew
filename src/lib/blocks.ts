/**
 * The block model a site renders a page from, and the operations the block editor performs on it.
 *
 * A page holds an ordered list of `{ type, props }` in a json field. barakoPress publishes what it
 * can render at `GET /api/blocks`, and this console builds the editor from that document alone. It
 * knows nothing about any site.
 *
 * Version 1 is `{ version: 1, blocks: [{ type, label, perViewer, fields }] }`. Version 2 adds three
 * things over it, all additive: `bindings` naming the scopes and formats a placeholder may use,
 * `layer` on each block, and `bindable` on each field. A version 1 site publishes no `bindings`, and
 * the editor is then exactly what it was before: no binding picker anywhere, and no field marked
 * for holding one.
 *
 * Version 2 later gained two field kinds without a version bump: `list`, whose `item` says what each
 * entry is, and `group`, whose `fields` are a sub-form. A console that does not know them edits
 * them as JSON, which is why the site did not need a new version to add them.
 *
 * Every operation keeps what it does not understand. A block whose type the schema does not list, a
 * prop no field declares, and a key beside `type` and `props` all survive an edit and a save.
 */

import type { FieldDefinition } from '@/types/schema';
import { hasBinding, readBindings, withoutBindings } from '@/lib/bindings';

export type BlockFieldKind = 'text' | 'markdown' | 'url' | 'number' | 'boolean' | 'select' | 'slots' | 'list' | 'group';

/** What one entry of a `list` may be. */
export const LIST_ITEM_KINDS: readonly string[] = ['text', 'url', 'number', 'group'];

/** One entry of a `list`: a value with its own range, or a group with its own fields. */
export interface ListItem {
    kind: string;
    label?: string;
    min?: number;
    max?: number;
    fields?: BlockField[];
    bindable?: boolean;
}

export interface BlockField {
    name: string;
    /** A kind this console does not know is kept as the string the site sent. */
    kind: BlockFieldKind | (string & {});
    label?: string;
    required?: boolean;
    options?: string[];
    min?: number;
    max?: number;
    /**
     * Whether the stored value may hold `{{scope.Path}}` placeholders. Published resolved by the
     * site from version 2, so the console reads one answer rather than reimplementing the default.
     * Absent from a version 1 schema, which is read as no field binding anything.
     */
    bindable?: boolean;
    /** What each entry of a `list` is. Absent when the site sent one this console cannot edit. */
    item?: ListItem;
    /** A `group`'s own fields. Absent when the site sent none this console can edit. */
    fields?: BlockField[];
}

/** What a block is for. `block` is what a version 1 schema's blocks all are. */
export type BlockLayer = 'primitive' | 'preset' | 'data' | 'block';

export interface BlockType {
    type: string;
    label: string;
    layer: BlockLayer | (string & {});
    perViewer: boolean;
    fields: BlockField[];
    /** A preset's body, for a block the tenant defined rather than the site. */
    preset?: unknown;
}

/** The scopes and formats a placeholder may name, exactly as the site published them. */
export interface BlockBindings {
    scopes: string[];
    formats: string[];
}

export interface BlockSchema {
    version: 1 | 2;
    /** Null from a site that publishes none, which is every version 1 site. */
    bindings: BlockBindings | null;
    blocks: BlockType[];
}

/** The order the palette groups layers in: parts first, then arrangements, then the data blocks. */
export const LAYER_ORDER: readonly string[] = ['primitive', 'block', 'data', 'preset'];

export const LAYER_LABELS: Record<string, string> = {
    primitive: 'Parts',
    block: 'Blocks',
    data: 'Content and conditions',
    preset: 'Saved blocks',
};

/**
 * Whether this console offers a binding picker for a field.
 *
 * Both halves matter. A site that publishes no `bindings` renders no placeholder, so offering one
 * would write `{{site.Name}}` into a page that shows those characters to a visitor.
 */
export function isBindable(schema: BlockSchema, field: BlockField): boolean {
    return schema.bindings !== null && field.bindable === true;
}

export type BlockItem = Record<string, unknown>;

/** The site's own bounds, from barakoPress: blocks read in the whole tree, and lists deep. */
export const MAX_BLOCKS = 100;
export const MAX_DEPTH = 4;

/** How deep lists and groups nest inside one field, counting the field itself. A list of groups counts once. */
export const MAX_FIELD_DEPTH = 3;

/** The most entries a `list` holds when it names no `max` of its own. */
export const MAX_LIST_ITEMS = 100;

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

function stringList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v !== '') : [];
}

/**
 * The scopes and formats, or null when the site published none this console can use.
 *
 * Null rather than empty lists on purpose: a scope list with nothing in it and no scope list at all
 * both mean the same thing here, which is that nothing is bindable.
 */
function parseBindings(raw: unknown): BlockBindings | null {
    if (!isRecord(raw)) return null;
    const scopes = stringList(raw.scopes);
    const formats = stringList(raw.formats);
    if (scopes.length === 0) return null;
    return { scopes, formats: formats.length > 0 ? formats : ['text'] };
}

function parseFields(raw: unknown, bindings: BlockBindings | null, depth: number): BlockField[] {
    const fields: BlockField[] = [];
    for (const f of Array.isArray(raw) ? raw : []) {
        if (!isRecord(f) || typeof f.name !== 'string' || !f.name || typeof f.kind !== 'string') continue;
        const field: BlockField = {
            name: f.name,
            kind: f.kind,
            label: typeof f.label === 'string' ? f.label : undefined,
            required: f.required === true,
            options: Array.isArray(f.options) ? f.options.filter((o): o is string => typeof o === 'string') : undefined,
            min: finite(f.min),
            max: finite(f.max),
            // Only a site that publishes bindings can render one, so a stray `bindable` on a
            // version 1 document is not read as permission to write a placeholder.
            bindable: bindings !== null && f.bindable === true,
        };
        // Past the depth the site reads, a list or a group keeps no structure and is edited as JSON.
        if (depth < MAX_FIELD_DEPTH) {
            if (f.kind === 'list') {
                const item = parseItem(f.item, bindings, depth + 1);
                if (item) field.item = item;
            } else if (f.kind === 'group') {
                const inner = parseFields(f.fields, bindings, depth + 1);
                if (inner.length > 0) field.fields = inner;
            }
        }
        fields.push(field);
    }
    return fields;
}

function parseItem(raw: unknown, bindings: BlockBindings | null, depth: number): ListItem | null {
    if (!isRecord(raw) || typeof raw.kind !== 'string' || !LIST_ITEM_KINDS.includes(raw.kind)) return null;
    const item: ListItem = {
        kind: raw.kind,
        label: typeof raw.label === 'string' && raw.label ? raw.label : undefined,
        min: finite(raw.min),
        max: finite(raw.max),
        bindable: bindings !== null && raw.bindable === true,
    };
    if (raw.kind === 'group') {
        const fields = parseFields(raw.fields, bindings, depth);
        if (fields.length === 0) return null;
        item.fields = fields;
    }
    return item;
}

/**
 * Whether a list or group field carries the structure the form needs. One that does not, because
 * the site sent an item this console does not know or nested past what the site reads, is edited
 * as JSON like any other kind this console does not know.
 */
export function isStructured(field: BlockField): boolean {
    if (field.kind === 'list') return field.item !== undefined;
    if (field.kind === 'group') return field.fields !== undefined && field.fields.length > 0;
    return false;
}

/** A list's entry as a field of its own, so it is checked and drawn by the same rules a prop is. */
export function itemField(field: BlockField, name: string = field.name): BlockField {
    const item = field.item ?? { kind: 'text' };
    return { ...item, name, label: item.label || field.label || field.name };
}

/** What a new entry of a list starts as: the emptiest value of its kind. */
export function newListEntry(item: ListItem): unknown {
    if (item.kind === 'number') return item.min !== undefined && item.min > 0 ? item.min : 0;
    if (item.kind === 'group') return {};
    return '';
}

/** A record with one key set, dropping it for an empty value the way `setProp` does. */
export function setKey(record: unknown, name: string, value: unknown): Record<string, unknown> {
    const next = { ...(isRecord(record) ? record : {}) };
    if (value === undefined || value === null || value === '') delete next[name];
    else next[name] = value;
    return next;
}

/**
 * The schema a site published, or null when the document is not one this console can build from.
 *
 * Version 1 and version 2 are both read, because version 2 only adds keys. A third version is
 * refused whole, since a later shape may mean something different by the same keys. Within a
 * version, an entry with no type or a field with no name is skipped rather than failing the rest.
 */
export function parseBlockSchema(raw: unknown): BlockSchema | null {
    if (!isRecord(raw) || !Array.isArray(raw.blocks)) return null;
    const version = raw.version === 1 ? 1 : raw.version === 2 ? 2 : null;
    if (version === null) return null;
    const bindings = version === 2 ? parseBindings(raw.bindings) : null;
    const blocks: BlockType[] = [];
    const seen = new Set<string>();
    for (const entry of raw.blocks) {
        if (!isRecord(entry) || typeof entry.type !== 'string' || !entry.type || seen.has(entry.type)) continue;
        seen.add(entry.type);
        const fields = parseFields(entry.fields, bindings, 0);
        blocks.push({
            type: entry.type,
            label: typeof entry.label === 'string' && entry.label ? entry.label : entry.type,
            layer: typeof entry.layer === 'string' && entry.layer ? entry.layer : 'block',
            perViewer: entry.perViewer === true,
            fields,
        });
    }
    return { version, bindings, blocks };
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

function bounds(field: { min?: number; max?: number }): string {
    const { min, max } = field;
    if (min !== undefined && max !== undefined) return ` from ${min} to ${max}`;
    if (min !== undefined) return ` of at least ${min}`;
    if (max !== undefined) return ` of at most ${max}`;
    return '';
}

function inRange(field: { min?: number; max?: number }, n: number) {
    return (field.min === undefined || n >= field.min) && (field.max === undefined || n <= field.max);
}

/**
 * The most harmless value of a field's kind, which is what barakoPress puts in a placeholder's
 * place before it checks a bindable prop.
 *
 * So `{{site.Url}}` passes a link field and `javascript:{{site.Url}}` does not, whatever the
 * binding turns out to hold. What it does hold is checked again on the server after it resolves.
 */
function standInFor(field: BlockField): string {
    if (field.kind === 'url') return '/x';
    if (field.kind === 'select') return field.options?.[0] ?? 'x';
    return 'x';
}

/**
 * What is wrong with each prop of a block, by field name, checked the way barakoPress checks it.
 *
 * The site skips a block with any wrong prop, required or not, so these are what would make it
 * disappear from the page. A kind this console does not know is not checked.
 *
 * A bindable prop holding a placeholder is checked with the placeholder stood in for, because what
 * is stored is a template and not the value. A field whose site no longer exists, or whose site
 * never published bindings, is checked as the literal text it is.
 */
export function validateBlock(schema: BlockSchema, type: BlockType, item: unknown): Record<string, string> {
    const props = propsOf(item);
    const errors: Record<string, string> = {};
    for (const field of type.fields) {
        const message = fieldProblem(schema, field, props[field.name]);
        if (message) errors[field.name] = message;
    }
    return errors;
}

const REQUIRED = 'Required. The site does not show this block without it.';

/** Nothing there, the way the site reads it. An empty list is nothing too, so a required one needs an entry. */
export function isAbsent(field: BlockField, value: unknown): boolean {
    if (value === undefined || value === null || value === '') return true;
    return field.kind === 'list' && Array.isArray(value) && value.length === 0;
}

/** What is wrong with one value held by a field, including a required one left empty, or null. */
export function fieldProblem(schema: BlockSchema, field: BlockField, value: unknown): string | null {
    if (isAbsent(field, value)) return field.required ? REQUIRED : null;
    return valueProblem(schema, field, value);
}

/** A whole list or group that is one placeholder, which the site resolves to the array or object it names. */
export function isWholeBinding(schema: BlockSchema, field: BlockField, value: unknown): value is string {
    if (!isBindable(schema, field) || typeof value !== 'string') return false;
    const found = readBindings(value);
    return found.length === 1 && found[0].raw === value.trim();
}

function valueProblem(schema: BlockSchema, field: BlockField, value: unknown): string | null {
    if (field.kind === 'list' && isStructured(field)) return listProblem(schema, field, value);
    if (field.kind === 'group' && isStructured(field)) return groupProblem(schema, field, value);
    const checked =
        isBindable(schema, field) && typeof value === 'string' && hasBinding(value)
            ? withoutBindings(value, standInFor(field))
            : value;
    return problem(field, checked);
}

/**
 * What is wrong with a list or a group as a whole, leaving its entries and parts out: missing when
 * required, not the shape its kind is, or a list holding too few or too many entries. A form shows
 * this on the field and each entry's own problem on the entry, so nothing is said twice.
 */
export function shapeProblem(schema: BlockSchema, field: BlockField, value: unknown): string | null {
    if (isAbsent(field, value)) return field.required ? REQUIRED : null;
    if (isWholeBinding(schema, field, value)) return null;
    if (field.kind === 'group') return isRecord(value) ? null : 'Has to be a group of values.';
    if (!Array.isArray(value)) return 'Has to be a list.';
    const cap = Math.min(field.max ?? MAX_LIST_ITEMS, MAX_LIST_ITEMS);
    if (inRange({ min: field.min, max: cap }, value.length)) return null;
    return field.min !== undefined ? `Has to hold from ${field.min} to ${cap} entries.` : `Has to hold at most ${cap} entries.`;
}

/** What is wrong with one entry of a list, which unlike a prop is never absent: an empty entry is wrong. */
export function entryProblem(schema: BlockSchema, field: BlockField, value: unknown): string | null {
    const entry = itemField(field);
    if (entry.kind === 'group' && !isRecord(value) && !isWholeBinding(schema, entry, value)) {
        return 'Has to be a group of values.';
    }
    return valueProblem(schema, entry, value);
}

function listProblem(schema: BlockSchema, field: BlockField, value: unknown): string | null {
    const shape = shapeProblem(schema, field, value);
    if (shape || !Array.isArray(value)) return shape;
    for (let i = 0; i < value.length; i++) {
        const message = entryProblem(schema, field, value[i]);
        if (message) return `Entry ${i + 1}: ${message}`;
    }
    return null;
}

function groupProblem(schema: BlockSchema, field: BlockField, value: unknown): string | null {
    const shape = shapeProblem(schema, field, value);
    if (shape || !isRecord(value)) return shape;
    for (const inner of field.fields ?? []) {
        const message = fieldProblem(schema, inner, value[inner.name]);
        if (message) return `${inner.label || inner.name}: ${message}`;
    }
    return null;
}

/**
 * Every string a field holds that may carry a placeholder, entries and parts included, so a
 * binding deep in a list is checked for a missing field the same as one on the block.
 */
export function boundStrings(schema: BlockSchema, field: BlockField, value: unknown): string[] {
    if (typeof value === 'string') return isBindable(schema, field) ? [value] : [];
    if (field.kind === 'list' && field.item && Array.isArray(value)) {
        const entry = itemField(field);
        return value.flatMap((v) => boundStrings(schema, entry, v));
    }
    if (field.kind === 'group' && field.fields && isRecord(value)) {
        return field.fields.flatMap((f) => boundStrings(schema, f, value[f.name]));
    }
    return [];
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
    const type = FIELD_TYPES[field.kind as Exclude<BlockFieldKind, 'select' | 'slots' | 'list' | 'group'>];
    if (!type) return null;
    return { name: id, displayName: field.label || field.name, type, isRequired: field.required === true };
}

const FIELD_TYPES: Record<Exclude<BlockFieldKind, 'select' | 'slots' | 'list' | 'group'>, FieldDefinition['type']> = {
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
