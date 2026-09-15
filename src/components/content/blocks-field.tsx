'use client';

import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/content/field-error';
import type { DynamicFormProps } from '@/components/content/dynamic-form';
import { IconChevronDown, IconChevronRight, IconMore, IconPlus, IconTrash } from '@/components/icons';
import { useBlockSchema, type BlockSchemaState } from '@/hooks/use-block-schema';
import {
    blockKey,
    blockSummary,
    blockTypeOf,
    countBlocks,
    definitionFor,
    dropIndex,
    fieldDefinitionFor,
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
import { cn } from '@/lib/utils';

/*
 * The form component is handed in rather than imported, because DynamicForm is what renders this
 * field, and each block prop is rendered by DynamicForm in turn.
 */
type Form = ComponentType<DynamicFormProps>;

interface Context {
    schema: BlockSchema;
    form: Form;
    announce: (message: string) => void;
}

type Action = 'up' | 'down' | 'toggle';
type Move = (from: number, to: number, action: Action | 'drag') => void;

function nameOf(schema: BlockSchema, item: unknown, index: number) {
    return `${definitionFor(schema, item)?.label ?? 'Unknown block'}, block ${index + 1}`;
}

function idPart(value: string) {
    return value.replace(/[^A-Za-z0-9_-]/g, '-');
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
}: {
    displayName: string;
    label: ReactNode;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
    json: ReactNode;
    form: Form;
}) {
    const state = useBlockSchema();
    const blocks = readBlocks(value);
    const [asJson, setAsJson] = useState(false);
    const [announcement, setAnnouncement] = useState('');

    const listed = state.status === 'ready' && blocks !== null && !asJson;
    const total = state.status === 'ready' && blocks !== null ? countBlocks(state.schema, blocks) : 0;

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

            {listed ? (
                <>
                    <BlockList
                        ctx={{ schema: state.schema, form, announce: setAnnouncement }}
                        list={blocks}
                        depth={0}
                        name={displayName}
                        onChange={onChange}
                    />
                    {total > MAX_BLOCKS && (
                        <p className="text-warning text-xs">
                            This page holds {total} blocks, and the site shows the first {MAX_BLOCKS}.
                        </p>
                    )}
                </>
            ) : (
                json
            )}

            <FieldError message={error} />
            <p aria-live="polite" className="sr-only">
                {announcement}
            </p>
        </div>
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
    depth,
    name,
    onChange,
}: {
    ctx: Context;
    list: unknown[];
    depth: number;
    name: string;
    onChange: (list: unknown[]) => void;
}) {
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
                                depth={depth}
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
                    className="flex flex-wrap gap-2 rounded-lg border border-dashed p-2"
                >
                    {ctx.schema.blocks.length === 0 ? (
                        <p className="text-muted-foreground px-2 py-1 text-sm">This site publishes no blocks.</p>
                    ) : (
                        ctx.schema.blocks.map((type) => (
                            <Button key={type.type} type="button" variant="ghost" size="sm" onClick={() => add(type)}>
                                {type.label}
                                {type.perViewer && <span className="text-muted-foreground text-xs">per viewer</span>}
                            </Button>
                        ))
                    )}
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
    depth,
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
    depth: number;
    open: boolean;
    onToggle: () => void;
    onChange: (item: unknown) => void;
    onMove: Move;
    onRemove: () => void;
}) {
    const type = definitionFor(ctx.schema, item);
    const name = nameOf(ctx.schema, item, index);
    const errors = type ? validateBlock(type, item) : {};
    const problems = Object.keys(errors).length;

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
                    <BlockFields
                        ctx={ctx}
                        type={type}
                        item={item}
                        idBase={itemKey}
                        depth={depth}
                        errors={errors}
                        onChange={onChange}
                    />
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
    depth,
    errors,
    onChange,
}: {
    ctx: Context;
    type: BlockType;
    item: unknown;
    idBase: string;
    depth: number;
    errors: Record<string, string>;
    onChange: (item: unknown) => void;
}) {
    const Form = ctx.form;
    const props = propsOf(item);
    const declared = new Set(type.fields.map((f) => f.name));
    const undeclared = Object.keys(props).filter((k) => !declared.has(k));

    return (
        <>
            {type.fields.length === 0 && <p className="text-muted-foreground text-sm">This block has nothing to set.</p>}
            {type.fields.map((field) => {
                const id = `${idBase}-${idPart(field.name)}`;
                const error = errors[field.name];
                if (field.kind === 'slots') {
                    return (
                        <SlotsProp
                            key={field.name}
                            ctx={ctx}
                            field={field}
                            item={item}
                            depth={depth}
                            error={error}
                            onChange={onChange}
                        />
                    );
                }
                if (field.kind === 'select') {
                    return (
                        <SelectProp
                            key={field.name}
                            id={id}
                            field={field}
                            value={props[field.name]}
                            error={error}
                            onChange={(v) => onChange(setProp(item, field.name, v))}
                        />
                    );
                }
                // A kind this console does not know yet is edited as JSON, which keeps whatever it holds.
                const definition = fieldDefinitionFor(field, id) ?? {
                    name: id,
                    displayName: field.label || field.name,
                    type: 'json' as const,
                    isRequired: field.required === true,
                };
                return (
                    <Form
                        key={field.name}
                        fields={[definition]}
                        values={{ [id]: props[field.name] }}
                        errors={error ? { [id]: error } : undefined}
                        onChange={(values) => onChange(setProp(item, field.name, values[id]))}
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

function SelectProp({
    id,
    field,
    value,
    error,
    onChange,
}: {
    id: string;
    field: BlockField;
    value: unknown;
    error?: string;
    onChange: (value: string) => void;
}) {
    const options = field.options ?? [];
    const current = typeof value === 'string' ? value : '';
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>
                {field.label || field.name}
                {field.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            <select
                id={id}
                value={current}
                onChange={(e) => onChange(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
                <option value="">{field.required ? 'Choose one' : 'None'}</option>
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
                {current && !options.includes(current) && <option value={current}>{current} (not offered)</option>}
            </select>
            <FieldError message={error} />
        </div>
    );
}

function SlotsProp({
    ctx,
    field,
    item,
    depth,
    error,
    onChange,
}: {
    ctx: Context;
    field: BlockField;
    item: unknown;
    depth: number;
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
                        depth={depth + 1}
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
