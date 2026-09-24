'use client';

import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/content/field-error';
import type { DynamicFormProps } from '@/components/content/dynamic-form';
import { IconChevronDown, IconChevronRight, IconMore, IconPlus, IconTrash } from '@/components/icons';
import { useBlockSchema, type BlockSchemaState } from '@/hooks/use-block-schema';
import { useSchemas } from '@/hooks/use-schemas';
import { usePresets } from '@/hooks/use-presets';
import { SaveConflictError } from '@/lib/concurrent-save';
import { idPart, PropField, type PropContext } from '@/components/content/block-props';
import { bindingProblems, scopesFor, type BindingScope } from '@/lib/binding-scopes';
import { presetFrom, isPresetName, withPresets, MAX_PRESETS, type BlockPreset } from '@/lib/presets';
import { SITE_TYPE } from '@/lib/site-settings';
import {
    blockKey,
    blockSummary,
    blockTypeOf,
    boundStrings,
    countBlocks,
    definitionFor,
    dropIndex,
    LAYER_LABELS,
    LAYER_ORDER,
    MAX_BLOCKS,
    MAX_DEPTH,
    move,
    newBlock,
    propsOf,
    readBlocks,
    removeAt,
    setProp,
    setSlotList,
    slotLists,
    validateBlock,
    type BlockField,
    type BlockSchema,
    type BlockType,
} from '@/lib/blocks';
import type { ContentTypeDefinition } from '@/types/schema';
import { cn } from '@/lib/utils';

/*
 * The form component is handed in rather than imported, because DynamicForm is what renders this
 * field, and each block prop is rendered by DynamicForm in turn.
 */
type Form = ComponentType<DynamicFormProps>;

/**
 * What the pickers read, gathered once for the whole field.
 *
 * Empty for a site that publishes no bindings, which is what turns every picker off at once: a
 * version 1 barakoPress renders `{{site.Name}}` as those eleven characters, so offering to write
 * one would be putting a mistake into a page.
 */
interface EditorSite {
    scopeNames: string[];
    formats: string[];
    siteType?: ContentTypeDefinition;
    pageType?: ContentTypeDefinition;
    typeNamed: (name: string) => ContentTypeDefinition | undefined;
    presets: BlockPreset[];
    savePreset: ((preset: BlockPreset) => Promise<void>) | null;
    presetNote?: string;
}

const NO_SITE: EditorSite = {
    scopeNames: [],
    formats: [],
    typeNamed: () => undefined,
    presets: [],
    savePreset: null,
};

/** Where one block sits, which is what decides the scopes its props can bind to. */
interface Spot {
    depth: number;
    /** True inside a block that loads content or repeats over it, which is where `item` holds a row. */
    insideData: boolean;
    /** The content type the nearest enclosing data block loads, so `item` can list its fields. */
    itemType?: ContentTypeDefinition;
}

const ROOT: Spot = { depth: 0, insideData: false };

interface Context {
    schema: BlockSchema;
    form: Form;
    announce: (message: string) => void;
    site: EditorSite;
}

type Action = 'up' | 'down' | 'toggle';
type Move = (from: number, to: number, action: Action | 'drag') => void;

function nameOf(schema: BlockSchema, item: unknown, index: number) {
    return `${definitionFor(schema, item)?.label ?? 'Unknown block'}, block ${index + 1}`;
}

/** The palette's groups: the layers the site named, in a fixed order, then any it invented. */
function byLayer(blocks: readonly BlockType[]): [string, BlockType[]][] {
    const groups = new Map<string, BlockType[]>();
    for (const block of blocks) {
        const layer = groups.get(block.layer);
        if (layer) layer.push(block);
        else groups.set(block.layer, [block]);
    }
    const order = (layer: string) => {
        const at = LAYER_ORDER.indexOf(layer);
        return at === -1 ? LAYER_ORDER.length : at;
    };
    return [...groups.entries()].sort((a, b) => order(a[0]) - order(b[0]));
}

/**
 * The content type a data block loads, so `{{item.X}}` inside it can list that type's fields.
 *
 * Read off the block's own props rather than from a list of block names, because which prop names
 * a collection is the site's business: whichever string prop holds the name of a content type this
 * tenant has is the one, and a prop called `collection` wins when there is more than one.
 */
function loadedType(ctx: Context, item: unknown): ContentTypeDefinition | undefined {
    const props = propsOf(item);
    const names = Object.keys(props).sort((a, b) => Number(b === 'collection') - Number(a === 'collection'));
    for (const key of names) {
        const value = props[key];
        if (typeof value !== 'string') continue;
        const type = ctx.site.typeNamed(value);
        if (type) return type;
    }
    return undefined;
}

/** The scopes a prop at this spot may bind to, or none at all from a site that publishes none. */
function scopesAt(ctx: Context, spot: Spot): BindingScope[] {
    if (ctx.site.scopeNames.length === 0) return [];
    return scopesFor(ctx.site.scopeNames, {
        siteType: ctx.site.siteType,
        pageType: ctx.site.pageType,
        itemType: spot.itemType,
        insideData: spot.insideData,
    });
}

/**
 * A page's blocks, edited as a list built from the block schema the site publishes.
 *
 * Every move is a button as well as a drag, so the list works from the keyboard. A block the schema
 * does not list is shown with its props and kept on save. Without a schema, while it is still being
 * read, or with a value that is not a list, the field is the JSON editor it was before.
 */
export function BlocksField({
    displayName,
    label,
    value,
    error,
    onChange,
    json,
    form,
    contentType,
}: {
    displayName: string;
    label: ReactNode;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
    json: ReactNode;
    form: Form;
    /** The type of the entry holding these blocks, which is what `{{page.X}}` reads. */
    contentType?: string;
}) {
    const state = useBlockSchema();
    const blocks = readBlocks(value);
    const [asJson, setAsJson] = useState(false);
    const [announcement, setAnnouncement] = useState('');

    const listed = state.status === 'ready' && blocks !== null && !asJson;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                {label}
                {state.status === 'ready' && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={blocks === null}
                        onClick={() => setAsJson(!asJson)}
                    >
                        {listed || blocks === null ? 'Edit as JSON' : 'Edit as blocks'}
                    </Button>
                )}
            </div>

            <SchemaNote state={state} readable={blocks !== null} />

            {listed && state.status === 'ready' ? (
                state.schema.bindings ? (
                    <WithSiteData schema={state.schema} contentType={contentType}>
                        {(site, schema) => (
                            <Editor
                                ctx={{ schema, form, announce: setAnnouncement, site }}
                                list={blocks}
                                name={displayName}
                                onChange={onChange}
                            />
                        )}
                    </WithSiteData>
                ) : (
                    <Editor
                        ctx={{ schema: state.schema, form, announce: setAnnouncement, site: NO_SITE }}
                        list={blocks}
                        name={displayName}
                        onChange={onChange}
                    />
                )
            ) : (
                // Typing while the schema loads keeps the JSON editor, so a half-typed value is not
                // swapped out for the block list when the schema arrives.
                <div className="contents" onChange={() => state.status === 'loading' && setAsJson(true)}>
                    {json}
                </div>
            )}

            <FieldError message={error} />
            <p aria-live="polite" className="sr-only">
                {announcement}
            </p>
        </div>
    );
}

/**
 * The tenant's own data behind the pickers: its content types, for the fields a scope offers, and
 * its saved blocks, which are data in a site setting rather than anything the site ships.
 *
 * Its own component so a site that publishes no bindings asks the API for none of it.
 */
function WithSiteData({
    schema,
    contentType,
    children,
}: {
    schema: BlockSchema;
    contentType?: string;
    children: (site: EditorSite, schema: BlockSchema) => ReactNode;
}) {
    const schemas = useSchemas();
    const presets = usePresets();
    const types = schemas.data ?? [];
    const typeNamed = (name: string) => types.find((t) => t.name.toLowerCase() === name.toLowerCase());

    const site: EditorSite = {
        scopeNames: schema.bindings?.scopes ?? [],
        formats: schema.bindings?.formats ?? [],
        siteType: typeNamed(SITE_TYPE),
        pageType: contentType ? typeNamed(contentType) : undefined,
        typeNamed,
        presets: presets.presets,
        savePreset: presets.save,
        presetNote: presets.reason,
    };
    return children(site, withPresets(schema, presets.presets));
}

function Editor({
    ctx,
    list,
    name,
    onChange,
}: {
    ctx: Context;
    list: unknown[];
    name: string;
    onChange: (list: unknown[]) => void;
}) {
    const total = countBlocks(ctx.schema, list);
    return (
        <>
            <BlockList ctx={ctx} list={list} spot={ROOT} name={name} onChange={onChange} />
            {total > MAX_BLOCKS && (
                <p className="text-warning text-xs">
                    This page holds {total} blocks, and the site shows the first {MAX_BLOCKS}.
                </p>
            )}
        </>
    );
}

function SchemaNote({ state, readable }: { state: BlockSchemaState; readable: boolean }) {
    switch (state.status) {
        case 'unconfigured':
            return (
                <p className="text-warning text-xs">
                    No site address is set for this console, so blocks are edited as JSON. Set
                    NEXT_PUBLIC_PRESS_URL to the site that renders these pages to edit them as blocks.
                </p>
            );
        case 'loading':
            return <p className="text-muted-foreground text-xs">Reading the blocks {state.url} can render.</p>;
        case 'unavailable':
            return (
                <p className="text-warning text-xs">
                    The block schema at {state.url}/api/blocks could not be read, so blocks are edited as JSON.
                </p>
            );
        case 'ready':
            return readable ? null : (
                <p className="text-warning text-xs">This value is not a list of blocks, so it is shown as JSON.</p>
            );
    }
}

function BlockList({
    ctx,
    list,
    spot,
    name,
    onChange,
}: {
    ctx: Context;
    list: unknown[];
    spot: Spot;
    name: string;
    onChange: (list: unknown[]) => void;
}) {
    const depth = spot.depth;
    const listId = useId();
    const ref = useRef<HTMLDivElement>(null);
    const [focus, setFocus] = useState<{ key: string; action: Action } | 'add' | null>(null);
    const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
    const [palette, setPalette] = useState(false);

    useEffect(() => {
        const root = ref.current;
        if (!focus || !root) return;
        if (focus === 'add') {
            root.querySelector<HTMLElement>(':scope > [data-block-add]')?.focus();
            return;
        }
        const row = root.querySelector(`:scope > ol > [data-block-key="${focus.key}"]`);
        const target =
            row?.querySelector<HTMLElement>(`:scope > [data-block-row] [data-action="${focus.action}"]:not(:disabled)`) ??
            row?.querySelector<HTMLElement>(':scope > [data-block-row] [data-action="toggle"]');
        target?.focus();
    }, [focus]);

    const moveBlock: Move = (from, to, action) => {
        const next = move(list, from, to);
        if (next === list) return;
        const item = list[from];
        onChange(next);
        if (action !== 'drag') setFocus({ key: blockKey(item, from), action });
        ctx.announce(
            `${definitionFor(ctx.schema, item)?.label ?? 'Unknown block'} moved to position ${to + 1} of ${list.length}`,
        );
    };

    const add = (type: BlockType) => {
        const item = newBlock(type);
        const key = blockKey(item, list.length);
        onChange([...list, item]);
        setOpen(new Set(open).add(key));
        setPalette(false);
        setFocus({ key, action: 'toggle' });
        ctx.announce(`${type.label} added at the end`);
    };

    const toggle = (key: string) => {
        const next = new Set(open);
        if (!next.delete(key)) next.add(key);
        setOpen(next);
    };

    return (
        <div ref={ref} className="space-y-2">
            {depth >= MAX_DEPTH && (
                <p className="text-warning text-xs">
                    The site reads blocks {MAX_DEPTH} levels deep at most, so nothing in here is shown.
                </p>
            )}
            {list.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">No blocks yet.</p>
            ) : (
                <ol aria-label={name} className="space-y-2">
                    {list.map((item, i) => {
                        const key = blockKey(item, i);
                        return (
                            <BlockRow
                                key={key}
                                ctx={ctx}
                                item={item}
                                itemKey={key}
                                index={i}
                                count={list.length}
                                listId={listId}
                                spot={spot}
                                open={open.has(key)}
                                onToggle={() => toggle(key)}
                                onChange={(next) => onChange(list.map((it, j) => (j === i ? next : it)))}
                                onMove={moveBlock}
                                onRemove={() => {
                                    onChange(removeAt(list, i));
                                    setFocus('add');
                                    ctx.announce(`${nameOf(ctx.schema, item, i)} removed`);
                                }}
                            />
                        );
                    })}
                </ol>
            )}
            <Button
                type="button"
                variant="outline"
                size="sm"
                data-block-add
                aria-expanded={palette}
                aria-label={depth === 0 ? undefined : `Add a block to ${name}`}
                onClick={() => setPalette(!palette)}
            >
                <IconPlus className="size-3.5" />
                Add a block
            </Button>
            {palette && (
                <div
                    role="group"
                    aria-label={`Blocks to add to ${name}`}
                    className="space-y-2 rounded-lg border border-dashed p-2"
                >
                    {ctx.schema.blocks.length === 0 ? (
                        <p className="text-muted-foreground px-2 py-1 text-sm">This site publishes no blocks.</p>
                    ) : (
                        byLayer(ctx.schema.blocks).map(([layer, types]) => (
                            <div key={layer} className="space-y-1">
                                {/* One layer means a version 1 site, where every block is just a block. */}
                                {byLayer(ctx.schema.blocks).length > 1 && (
                                    <p className="text-muted-foreground px-1 text-xs font-semibold">
                                        {LAYER_LABELS[layer] ?? layer}
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {types.map((type) => (
                                        <Button
                                            key={type.type}
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => add(type)}
                                        >
                                            {type.label}
                                            {type.perViewer && (
                                                <span className="text-muted-foreground text-xs">per viewer</span>
                                            )}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                    {ctx.site.presetNote && <p className="text-muted-foreground px-1 text-xs">{ctx.site.presetNote}</p>}
                </div>
            )}
        </div>
    );
}

function BlockRow({
    ctx,
    item,
    itemKey,
    index,
    count,
    listId,
    spot,
    open,
    onToggle,
    onChange,
    onMove,
    onRemove,
}: {
    ctx: Context;
    item: unknown;
    itemKey: string;
    index: number;
    count: number;
    listId: string;
    spot: Spot;
    open: boolean;
    onToggle: () => void;
    onChange: (item: unknown) => void;
    onMove: Move;
    onRemove: () => void;
}) {
    const type = definitionFor(ctx.schema, item);
    const name = nameOf(ctx.schema, item, index);
    const errors = type ? validateBlock(ctx.schema, type, item) : {};
    const problems = Object.keys(errors).length;

    const scopes = scopesAt(ctx, spot);
    // A block that loads or repeats gives what is inside it an `item`, and carries down the one it
    // was given when it names no collection of its own, which is how a repeat inside a source works.
    const inner: Spot =
        type?.layer === 'data'
            ? { depth: spot.depth, insideData: true, itemType: loadedType(ctx, item) ?? spot.itemType }
            : spot;
    const warnings = type
        ? type.fields.flatMap((field) =>
              boundStrings(ctx.schema, field, propsOf(item)[field.name]).flatMap((v) => bindingProblems(v, scopes)),
          )
        : [];

    const rowRef = useRef<HTMLLIElement>(null);
    const handleRef = useRef<HTMLSpanElement>(null);
    const moveRef = useRef(onMove);
    const [edge, setEdge] = useState<'top' | 'bottom' | null>(null);
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        moveRef.current = onMove;
    });

    // Registered once per position, not per render: a drag in progress would be dropped if its
    // element were unregistered and registered again while the pointer moves.
    useEffect(() => {
        const element = rowRef.current;
        const dragHandle = handleRef.current;
        if (!element || !dragHandle) return;
        const edgeAt = (clientY: number) => {
            const rect = element.getBoundingClientRect();
            return clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
        };
        return combine(
            draggable({
                element,
                dragHandle,
                getInitialData: () => ({ listId, index }),
                onDragStart: () => setDragging(true),
                onDrop: () => setDragging(false),
            }),
            dropTargetForElements({
                element,
                // Within one list only. Moving a block into another list is not something this does.
                canDrop: ({ source }) => source.data.listId === listId,
                getData: () => ({ listId, index }),
                onDrag: ({ source, location }) =>
                    setEdge(source.data.index === index ? null : edgeAt(location.current.input.clientY)),
                onDragLeave: () => setEdge(null),
                onDrop: ({ source, location }) => {
                    setEdge(null);
                    const from = source.data.index;
                    if (typeof from !== 'number' || from === index) return;
                    moveRef.current(from, dropIndex(from, index, edgeAt(location.current.input.clientY)), 'drag');
                },
            }),
        );
    }, [listId, index]);

    return (
        <li
            ref={rowRef}
            data-block-key={itemKey}
            className={cn('bg-card relative rounded-lg border', dragging && 'opacity-50')}
        >
            {edge && (
                <div
                    aria-hidden="true"
                    className={cn('bg-primary absolute inset-x-0 h-0.5', edge === 'top' ? '-top-1.5' : '-bottom-1.5')}
                />
            )}
            <div data-block-row className="flex items-center gap-1 p-2">
                <span
                    ref={handleRef}
                    aria-hidden="true"
                    title="Drag to reorder"
                    className="text-muted-foreground cursor-grab px-1"
                >
                    <IconMore className="size-4 rotate-90" />
                </span>
                <button
                    type="button"
                    data-action="toggle"
                    aria-expanded={open}
                    aria-controls={`${itemKey}-body`}
                    onClick={onToggle}
                    className="focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left text-sm outline-none focus-visible:ring-[3px]"
                >
                    <IconChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
                    <span className="shrink-0 font-medium">{type ? type.label : 'Unknown block'}</span>
                    <span className="text-muted-foreground truncate">
                        {type ? blockSummary(type, item) : (blockTypeOf(item) ?? 'not a block')}
                    </span>
                </button>
                {problems > 0 && (
                    <span className="text-destructive shrink-0 text-xs">
                        {problems === 1 ? '1 problem' : `${problems} problems`}
                    </span>
                )}
                {warnings.length > 0 && (
                    <span className="text-warning shrink-0 text-xs">
                        {warnings.length === 1 ? '1 data problem' : `${warnings.length} data problems`}
                    </span>
                )}
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-action="up"
                    aria-label={`Move ${name} up`}
                    title="Move up"
                    disabled={index === 0}
                    onClick={() => onMove(index, index - 1, 'up')}
                >
                    <IconChevronDown className="size-4 rotate-180" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-action="down"
                    aria-label={`Move ${name} down`}
                    title="Move down"
                    disabled={index === count - 1}
                    onClick={() => onMove(index, index + 1, 'down')}
                >
                    <IconChevronDown className="size-4" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${name}`}
                    title="Remove"
                    onClick={onRemove}
                >
                    <IconTrash className="size-4" />
                </Button>
            </div>
            <div id={`${itemKey}-body`} hidden={!open} className="space-y-4 border-t p-3">
                {type ? (
                    <>
                        <BlockFields
                            ctx={ctx}
                            type={type}
                            item={item}
                            idBase={itemKey}
                            spot={inner}
                            scopes={scopes}
                            errors={errors}
                            onChange={onChange}
                        />
                        <SavePreset ctx={ctx} type={type} item={item} />
                    </>
                ) : (
                    <UnknownBlock item={item} />
                )}
            </div>
        </li>
    );
}

function UnknownBlock({ item }: { item: unknown }) {
    const type = blockTypeOf(item);
    return (
        <>
            <p className="text-warning text-xs">
                {type
                    ? `This site has no block called "${type}", so the page does not show it.`
                    : 'This entry is not a block, so the page does not show it.'}{' '}
                It is kept as it is when you save, and can be moved or removed.
            </p>
            <pre className="bg-muted text-muted-foreground rounded-md p-3 font-mono text-xs break-all whitespace-pre-wrap">
                {JSON.stringify(type ? propsOf(item) : item, null, 2)}
            </pre>
        </>
    );
}

function BlockFields({
    ctx,
    type,
    item,
    idBase,
    spot,
    scopes,
    errors,
    onChange,
}: {
    ctx: Context;
    type: BlockType;
    item: unknown;
    idBase: string;
    spot: Spot;
    scopes: BindingScope[];
    errors: Record<string, string>;
    onChange: (item: unknown) => void;
}) {
    const values = propsOf(item);
    const declared = new Set(type.fields.map((f) => f.name));
    const undeclared = Object.keys(values).filter((k) => !declared.has(k));
    const props: PropContext = { schema: ctx.schema, form: ctx.form, scopes, formats: ctx.site.formats, announce: ctx.announce };

    return (
        <>
            {type.fields.length === 0 && <p className="text-muted-foreground text-sm">This block has nothing to set.</p>}
            {type.fields.map((field) => {
                if (field.kind === 'slots') {
                    return (
                        <SlotsProp
                            key={field.name}
                            ctx={ctx}
                            field={field}
                            item={item}
                            spot={spot}
                            error={errors[field.name]}
                            onChange={onChange}
                        />
                    );
                }
                return (
                    <PropField
                        key={field.name}
                        ctx={props}
                        field={field}
                        id={`${idBase}-${idPart(field.name)}`}
                        value={values[field.name]}
                        error={errors[field.name]}
                        onChange={(v) => onChange(setProp(item, field.name, v))}
                    />
                );
            })}
            {undeclared.length > 0 && (
                <p className="text-muted-foreground text-xs">
                    Also holds {undeclared.join(', ')}, which this block does not declare. Kept as it is.
                </p>
            )}
        </>
    );
}

function SlotsProp({
    ctx,
    field,
    item,
    spot,
    error,
    onChange,
}: {
    ctx: Context;
    field: BlockField;
    item: unknown;
    spot: Spot;
    error?: string;
    onChange: (item: unknown) => void;
}) {
    const label = field.label || field.name;
    const raw = propsOf(item)[field.name];

    // Editing a value that is not lists of blocks would mean replacing it, so it is only shown.
    if (raw !== undefined && raw !== null && !(Array.isArray(raw) && raw.every(Array.isArray))) {
        return (
            <div className="space-y-2">
                <p className="text-sm font-medium">{label}</p>
                <pre className="bg-muted text-muted-foreground rounded-md p-3 font-mono text-xs break-all whitespace-pre-wrap">
                    {JSON.stringify(raw, null, 2)}
                </pre>
                <FieldError message={error} />
            </div>
        );
    }

    const lists = slotLists(item, field.name);
    const atMin = lists.length <= (field.min ?? 0);
    const atMax = field.max !== undefined && lists.length >= field.max;

    return (
        <fieldset className="space-y-3">
            <legend className="text-sm font-medium">
                {label}
                {field.required && <span className="text-destructive ml-0.5">*</span>}
            </legend>
            {lists.map((list, i) => (
                <section
                    key={i}
                    aria-label={`${label} ${i + 1}`}
                    className="space-y-2 rounded-lg border border-dashed p-3"
                >
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-muted-foreground text-xs font-semibold">
                            {label} {i + 1}
                        </p>
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            aria-label={`Remove ${label} ${i + 1}`}
                            disabled={atMin}
                            onClick={() => onChange(setProp(item, field.name, removeAt(lists, i)))}
                        >
                            Remove
                        </Button>
                    </div>
                    <BlockList
                        ctx={ctx}
                        list={list}
                        spot={{ ...spot, depth: spot.depth + 1 }}
                        name={`${label} ${i + 1}`}
                        onChange={(next) => onChange(setSlotList(item, field.name, i, next))}
                    />
                </section>
            ))}
            <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={atMax}
                onClick={() => onChange(setProp(item, field.name, [...lists, []]))}
            >
                <IconPlus className="size-3" />
                Add to {label}
            </Button>
            <FieldError message={error} />
        </fieldset>
    );
}

/**
 * Saves one block and everything inside it as a named block this tenant can use again.
 *
 * A preset is data in a site setting, not code, so this writes to the tenant and every site on the
 * same published image is unaffected. It is offered for a block that is code and not for one that
 * is already a preset, because barakoPress refuses a preset that stands for another preset.
 */
function SavePreset({ ctx, type, item }: { ctx: Context; type: BlockType; item: unknown }) {
    const ids = useId();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [label, setLabel] = useState('');
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState('');
    const [saved, setSaved] = useState('');

    const save = ctx.site.savePreset;
    if (!save || type.layer === 'preset' || ctx.site.scopeNames.length === 0) return null;

    const taken = ctx.site.presets.some((p) => p.type === name);
    const full = ctx.site.presets.length >= MAX_PRESETS && !taken;
    const badName = name !== '' && !isPresetName(name);
    const clash = !taken && ctx.schema.blocks.some((b) => b.type === name && b.layer !== 'preset');

    const submit = async () => {
        setSaving(true);
        setFailed('');
        try {
            await save(presetFrom(name, label.trim() || name, [item]));
            setSaved(`Saved as ${label.trim() || name}.`);
            setOpen(false);
            setName('');
            setLabel('');
        } catch (error) {
            // A refused save is the one failure worth naming: it says somebody else changed the same
            // thing, which is not something trying again fixes.
            setFailed(
                error instanceof SaveConflictError
                    ? error.message
                    : 'The site settings could not be saved. Try again.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-2 border-t pt-3">
            <Button type="button" variant="ghost" size="xs" aria-expanded={open} onClick={() => setOpen(!open)}>
                <IconPlus className="size-3" />
                Save as a reusable block
            </Button>
            {saved && !open && <p className="text-muted-foreground text-xs">{saved}</p>}
            {open && (
                <div role="group" aria-label="Save as a reusable block" className="space-y-2 rounded-lg border p-3">
                    <p className="text-muted-foreground text-xs">
                        Saved for this site only, beside its other settings. Every page here can then add it.
                    </p>
                    <div className="space-y-1">
                        <Label htmlFor={`${ids}-name`}>Name</Label>
                        <Input
                            id={`${ids}-name`}
                            value={name}
                            placeholder="band"
                            onChange={(e) => setName(e.target.value)}
                        />
                        {badName && (
                            <p className="text-destructive text-xs">
                                A letter first, then letters, numbers, dashes or underscores.
                            </p>
                        )}
                        {clash && (
                            <p className="text-destructive text-xs">
                                This site already has a block called {name}, and it wins over a saved one.
                            </p>
                        )}
                        {taken && <p className="text-warning text-xs">This replaces the saved block called {name}.</p>}
                        {full && (
                            <p className="text-destructive text-xs">
                                This site already holds {MAX_PRESETS} saved blocks, which is the most.
                            </p>
                        )}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor={`${ids}-label`}>What to call it in the palette</Label>
                        <Input
                            id={`${ids}-label`}
                            value={label}
                            placeholder="Band"
                            onChange={(e) => setLabel(e.target.value)}
                        />
                    </div>
                    {failed && <p className="text-destructive text-xs">{failed}</p>}
                    <Button
                        type="button"
                        size="sm"
                        disabled={saving || name === '' || badName || clash || full}
                        onClick={submit}
                    >
                        {saving ? 'Saving' : 'Save'}
                    </Button>
                </div>
            )}
        </div>
    );
}
