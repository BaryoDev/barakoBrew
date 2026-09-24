'use client';

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/content/field-error';
import type { DynamicFormProps } from '@/components/content/dynamic-form';
import { BindingControl } from '@/components/content/binding-picker';
import { IconChevronDown, IconChevronRight, IconPlus, IconTrash } from '@/components/icons';
import type { BindingScope } from '@/lib/binding-scopes';
import {
    entryProblem,
    fieldDefinitionFor,
    fieldProblem,
    isAbsent,
    isBindable,
    isStructured,
    isWholeBinding,
    itemField,
    MAX_LIST_ITEMS,
    move,
    newListEntry,
    removeAt,
    setKey,
    shapeProblem,
    type BlockField,
    type BlockSchema,
} from '@/lib/blocks';
import { cn } from '@/lib/utils';

/** What every prop control needs from the editor around it. */
export interface PropContext {
    schema: BlockSchema;
    form: ComponentType<DynamicFormProps>;
    /** The scopes a binding may use at this spot. Empty turns every picker off. */
    scopes: BindingScope[];
    formats: string[];
    announce: (message: string) => void;
    /** The tenant's style recipe names, offered by a `recipe` field. Absent or empty offers none. */
    recipes?: string[];
}

export function idPart(value: string) {
    return value.replace(/[^A-Za-z0-9_-]/g, '-');
}

function labelOf(field: BlockField) {
    return field.label || field.name;
}

/**
 * One prop, or one part of a group, drawn as the control its kind calls for.
 *
 * `error` is what is wrong with the value as a whole. A list or a group works out what is wrong
 * with each of its entries and parts itself, and shows that on them.
 */
export function PropField({
    ctx,
    field,
    id,
    value,
    error,
    onChange,
}: {
    ctx: PropContext;
    field: BlockField;
    id: string;
    value: unknown;
    error?: string | null;
    onChange: (value: unknown) => void;
}) {
    if (field.kind === 'list' && isStructured(field)) {
        return <ListProp ctx={ctx} field={field} id={id} value={value} onChange={onChange} />;
    }
    if (field.kind === 'group' && isStructured(field)) {
        return <GroupProp ctx={ctx} field={field} id={id} value={value} onChange={onChange} />;
    }

    const Form = ctx.form;
    const binding = isBindable(ctx.schema, field) && ctx.scopes.length > 0 && (
        <BindingControl
            fieldLabel={labelOf(field)}
            scopes={ctx.scopes}
            formats={ctx.formats}
            value={value}
            onChange={onChange}
        />
    );

    if (field.name === 'recipe' && field.kind === 'text' && (ctx.recipes?.length ?? 0) > 0) {
        return (
            <div className="space-y-2">
                <RecipeProp id={id} field={field} recipes={ctx.recipes!} value={value} error={error ?? undefined} onChange={onChange} />
                {binding}
            </div>
        );
    }

    if (field.kind === 'select') {
        return (
            <div className="space-y-2">
                <SelectProp id={id} field={field} value={value} error={error ?? undefined} onChange={onChange} />
                {binding}
            </div>
        );
    }

    // A kind this console does not know yet is edited as JSON, which keeps whatever it holds.
    const definition = fieldDefinitionFor(field, id) ?? {
        name: id,
        displayName: labelOf(field),
        type: 'json' as const,
        isRequired: field.required === true,
    };
    return (
        <div className="space-y-2">
            <Form
                fields={[definition]}
                values={{ [id]: value }}
                errors={error ? { [id]: error } : undefined}
                onChange={(values) => onChange(values[id])}
            />
            {binding}
        </div>
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
                {labelOf(field)}
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

/**
 * A block's style recipe: a text box offering the tenant's recipe names. Text and not a select,
 * because the site takes a bound name too, such as `card-{{item.Product}}`, and a preset passes its
 * own prop through the same way.
 */
function RecipeProp({
    id,
    field,
    recipes,
    value,
    error,
    onChange,
}: {
    id: string;
    field: BlockField;
    recipes: readonly string[];
    value: unknown;
    error?: string;
    onChange: (value: string | undefined) => void;
}) {
    const current = typeof value === 'string' ? value : '';
    const unknown = current.trim() !== '' && !current.includes('{{') && !recipes.includes(current.trim());
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{labelOf(field)}</Label>
            <Input
                id={id}
                list={`${id}-recipes`}
                value={current}
                placeholder="None"
                spellCheck={false}
                aria-describedby={unknown ? `${id}-hint` : undefined}
                onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
            />
            <datalist id={`${id}-recipes`}>
                {recipes.map((name) => (
                    <option key={name} value={name}>
                        {name}
                    </option>
                ))}
            </datalist>
            {unknown && (
                <p id={`${id}-hint`} className="text-warning text-xs">
                    This site has no recipe called {current.trim()}, so the block draws its own look.
                </p>
            )}
            <FieldError message={error} />
        </div>
    );
}

/**
 * A list or group holding something other than entries or parts: a placeholder the site fills from
 * data, or a value of the wrong shape. Shown rather than edited, since editing would mean replacing
 * it, with a button that does exactly that.
 */
function Replaceable({
    ctx,
    field,
    value,
    replaceWith,
    onChange,
}: {
    ctx: PropContext;
    field: BlockField;
    value: unknown;
    replaceWith: string;
    onChange: (value: unknown) => void;
}) {
    const bound = isWholeBinding(ctx.schema, field, value) && ctx.scopes.length > 0;
    return (
        <div className="space-y-2">
            {bound ? (
                <>
                    <p className="text-muted-foreground text-xs">Filled from data when the page renders.</p>
                    <BindingControl
                        fieldLabel={labelOf(field)}
                        scopes={ctx.scopes}
                        formats={ctx.formats}
                        value={value}
                        onChange={onChange}
                    />
                </>
            ) : (
                <pre className="bg-muted text-muted-foreground rounded-md p-3 font-mono text-xs break-all whitespace-pre-wrap">
                    {JSON.stringify(value, null, 2)}
                </pre>
            )}
            <Button type="button" variant="outline" size="xs" onClick={() => onChange(undefined)}>
                {replaceWith}
            </Button>
        </div>
    );
}

/** The picker that fills a whole empty list or group from one placeholder, `{{item.Tags}}`. */
function WholeBinding({
    ctx,
    field,
    value,
    onChange,
}: {
    ctx: PropContext;
    field: BlockField;
    value: unknown;
    onChange: (value: unknown) => void;
}) {
    if (!isBindable(ctx.schema, field) || ctx.scopes.length === 0 || !isAbsent(field, value)) return null;
    return (
        <BindingControl
            fieldLabel={labelOf(field)}
            scopes={ctx.scopes}
            formats={ctx.formats}
            value={undefined}
            onChange={onChange}
        />
    );
}

function Legend({ field }: { field: BlockField }) {
    return (
        <legend className="text-sm font-medium">
            {labelOf(field)}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
        </legend>
    );
}

function GroupProp({
    ctx,
    field,
    id,
    value,
    onChange,
}: {
    ctx: PropContext;
    field: BlockField;
    id: string;
    value: unknown;
    onChange: (value: unknown) => void;
}) {
    const present = !isAbsent(field, value);
    const shaped = !present || (typeof value === 'object' && value !== null && !Array.isArray(value));
    return (
        <fieldset className="space-y-3 rounded-lg border p-3">
            <Legend field={field} />
            {shaped ? (
                <GroupFields
                    ctx={ctx}
                    fields={field.fields ?? []}
                    idBase={id}
                    value={value}
                    checked={present}
                    // A group emptied of every part is no group, which is how the site reads it too.
                    onChange={(next) => onChange(Object.keys(next).length === 0 ? undefined : next)}
                />
            ) : (
                <Replaceable ctx={ctx} field={field} value={value} replaceWith="Use fields instead" onChange={onChange} />
            )}
            <WholeBinding ctx={ctx} field={field} value={value} onChange={onChange} />
            <FieldError message={shapeProblem(ctx.schema, field, value) ?? undefined} />
        </fieldset>
    );
}

/**
 * The parts of a group. `checked` is false for a group that is not there at all, where a required
 * part is not missing yet: the site only asks for it once the group exists.
 */
function GroupFields({
    ctx,
    fields,
    idBase,
    value,
    checked,
    onChange,
}: {
    ctx: PropContext;
    fields: BlockField[];
    idBase: string;
    value: unknown;
    checked: boolean;
    onChange: (value: Record<string, unknown>) => void;
}) {
    const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const declared = new Set(fields.map((f) => f.name));
    const undeclared = Object.keys(record).filter((k) => !declared.has(k));
    return (
        <div className="space-y-4">
            {fields.map((inner) => {
                const own = isStructured(inner) ? null : checked ? fieldProblem(ctx.schema, inner, record[inner.name]) : null;
                return (
                    <PropField
                        key={inner.name}
                        ctx={ctx}
                        field={inner}
                        id={`${idBase}-${idPart(inner.name)}`}
                        value={record[inner.name]}
                        error={own}
                        onChange={(v) => onChange(setKey(record, inner.name, v))}
                    />
                );
            })}
            {undeclared.length > 0 && (
                <p className="text-muted-foreground text-xs">
                    Also holds {undeclared.join(', ')}, which this group does not declare. Kept as it is.
                </p>
            )}
        </div>
    );
}

let nextEntry = 0;
const newEntryKey = () => `entry-${++nextEntry}`;

type EntryAction = 'up' | 'down' | 'toggle' | 'field';

/**
 * A list prop: entries of one kind, added, removed and moved with buttons, so all of it works from
 * the keyboard. A list of groups draws each entry as a row that opens to its parts; a list of values
 * draws each as one labelled box.
 */
function ListProp({
    ctx,
    field,
    id,
    value,
    onChange,
}: {
    ctx: PropContext;
    field: BlockField;
    id: string;
    value: unknown;
    onChange: (value: unknown) => void;
}) {
    const ref = useRef<HTMLFieldSetElement>(null);
    const entries = Array.isArray(value) ? value : [];
    const item = field.item!;
    const entryLabel = item.label || labelOf(field);
    const label = labelOf(field);

    // Entries carry no id and may be plain strings, so each gets a key that follows it through a
    // move. Kept beside the list and trimmed or topped up when the list changes from outside.
    const [keys, setKeys] = useState<string[]>(() => entries.map(newEntryKey));
    let current = keys;
    if (keys.length !== entries.length) {
        current = [...keys.slice(0, entries.length)];
        while (current.length < entries.length) current.push(newEntryKey());
        setKeys(current);
    }
    const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
    const [focus, setFocus] = useState<{ key: string; action: EntryAction } | 'add' | null>(null);

    useEffect(() => {
        const root = ref.current;
        if (!focus || !root) return;
        if (focus === 'add') {
            root.querySelector<HTMLElement>(':scope > [data-entry-add]')?.focus();
            return;
        }
        const row = root.querySelector(`:scope > ol > [data-entry-key="${focus.key}"]`);
        const target =
            focus.action === 'field'
                ? row?.querySelector<HTMLElement>('input, textarea, select')
                : (row?.querySelector<HTMLElement>(`:scope > [data-entry-row] [data-action="${focus.action}"]:not(:disabled)`) ??
                  row?.querySelector<HTMLElement>(':scope > [data-entry-row] [data-action="toggle"]'));
        target?.focus();
    }, [focus]);

    const cap = Math.min(field.max ?? MAX_LIST_ITEMS, MAX_LIST_ITEMS);
    const atMax = entries.length >= cap;
    const atMin = entries.length <= (field.min ?? 0);
    const isGroup = item.kind === 'group';
    const shaped = isAbsent(field, value) || Array.isArray(value);

    const set = (next: unknown[], nextKeys: string[]) => {
        setKeys(nextKeys);
        onChange(next.length === 0 ? undefined : next);
    };

    const add = () => {
        const key = newEntryKey();
        set([...entries, newListEntry(item)], [...current, key]);
        if (isGroup) setOpen(new Set(open).add(key));
        setFocus({ key, action: isGroup ? 'toggle' : 'field' });
        ctx.announce(`${entryLabel} added at the end`);
    };

    const moveEntry = (from: number, to: number, action: 'up' | 'down') => {
        const next = move(entries, from, to);
        if (next === entries) return;
        set(next, move(current, from, to));
        setFocus({ key: current[from], action });
        ctx.announce(`${entryLabel} moved to position ${to + 1} of ${entries.length}`);
    };

    const remove = (index: number) => {
        set(removeAt(entries, index), removeAt(current, index));
        setFocus('add');
        ctx.announce(`${entryLabel} ${index + 1} removed`);
    };

    const toggle = (key: string) => {
        const next = new Set(open);
        if (!next.delete(key)) next.add(key);
        setOpen(next);
    };

    return (
        <fieldset ref={ref} className="space-y-2">
            <Legend field={field} />
            {!shaped ? (
                <Replaceable ctx={ctx} field={field} value={value} replaceWith="Use entries instead" onChange={onChange} />
            ) : entries.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">No entries yet.</p>
            ) : (
                <ol aria-label={label} className="space-y-2">
                    {entries.map((entry, i) => {
                        const key = current[i];
                        const name = `${entryLabel} ${i + 1}`;
                        const controls = (
                            <EntryButtons
                                name={name}
                                index={i}
                                count={entries.length}
                                atMin={atMin}
                                onMove={moveEntry}
                                onRemove={() => remove(i)}
                            />
                        );
                        const update = (v: unknown) => onChange(entries.map((e, j) => (j === i ? v : e)));
                        return isGroup ? (
                            <GroupEntry
                                key={key}
                                ctx={ctx}
                                field={field}
                                entryKey={key}
                                name={name}
                                value={entry}
                                open={open.has(key)}
                                onToggle={() => toggle(key)}
                                onChange={update}
                                controls={controls}
                            />
                        ) : (
                            <li key={key} data-entry-key={key} className="flex items-start gap-1">
                                <div className="min-w-0 flex-1">
                                    <PropField
                                        ctx={ctx}
                                        field={{ ...itemField(field), label: name }}
                                        id={`${id}-${key}`}
                                        value={entry}
                                        error={entryProblem(ctx.schema, field, entry)}
                                        onChange={update}
                                    />
                                </div>
                                <div data-entry-row className="flex shrink-0 items-center gap-1 pt-6">
                                    {controls}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
            {shaped && (
                <Button type="button" variant="outline" size="xs" data-entry-add disabled={atMax} onClick={add}>
                    <IconPlus className="size-3" />
                    Add to {label}
                </Button>
            )}
            <WholeBinding ctx={ctx} field={field} value={value} onChange={onChange} />
            <FieldError message={shapeProblem(ctx.schema, field, value) ?? undefined} />
        </fieldset>
    );
}

function EntryButtons({
    name,
    index,
    count,
    atMin,
    onMove,
    onRemove,
}: {
    name: string;
    index: number;
    count: number;
    atMin: boolean;
    onMove: (from: number, to: number, action: 'up' | 'down') => void;
    onRemove: () => void;
}) {
    return (
        <>
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
                disabled={atMin}
                onClick={onRemove}
            >
                <IconTrash className="size-4" />
            </Button>
        </>
    );
}

/** The first short text a group holds, so a closed row says which entry it is. */
function summaryOf(fields: BlockField[], value: unknown): string {
    if (typeof value !== 'object' || value === null) return '';
    const record = value as Record<string, unknown>;
    for (const f of fields) {
        const v = record[f.name];
        if ((f.kind === 'text' || f.kind === 'select') && typeof v === 'string' && v.trim()) {
            const text = v.trim();
            return text.length > 60 ? `${text.slice(0, 57)}...` : text;
        }
    }
    return '';
}

function GroupEntry({
    ctx,
    field,
    entryKey,
    name,
    value,
    open,
    onToggle,
    onChange,
    controls,
}: {
    ctx: PropContext;
    field: BlockField;
    entryKey: string;
    name: string;
    value: unknown;
    open: boolean;
    onToggle: () => void;
    onChange: (value: unknown) => void;
    controls: ReactNode;
}) {
    const fields = field.item?.fields ?? [];
    const record = typeof value === 'object' && value !== null && !Array.isArray(value);
    const problems = record
        ? fields.filter((f) => fieldProblem(ctx.schema, f, (value as Record<string, unknown>)[f.name])).length
        : 1;
    const bodyId = `${entryKey}-body`;
    return (
        <li data-entry-key={entryKey} className="bg-card rounded-lg border">
            <div data-entry-row className="flex items-center gap-1 p-2">
                <button
                    type="button"
                    data-action="toggle"
                    aria-expanded={open}
                    aria-controls={bodyId}
                    onClick={onToggle}
                    className="focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left text-sm outline-none focus-visible:ring-[3px]"
                >
                    <IconChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
                    <span className="shrink-0 font-medium">{name}</span>
                    <span className="text-muted-foreground truncate">{summaryOf(fields, value)}</span>
                </button>
                {problems > 0 && (
                    <span className="text-destructive shrink-0 text-xs">
                        {problems === 1 ? '1 problem' : `${problems} problems`}
                    </span>
                )}
                {controls}
            </div>
            <div id={bodyId} hidden={!open} className="space-y-4 border-t p-3">
                {!record && <FieldError message="Has to be a group of values." />}
                <GroupFields
                    ctx={ctx}
                    fields={fields}
                    idBase={entryKey}
                    value={value}
                    checked
                    onChange={onChange}
                />
            </div>
        </li>
    );
}
