'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Controller, useForm, useFormState, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/patterns/empty-state';
import {
    IconChevronDown,
    IconContentTypes,
    IconMore,
    IconPen,
    IconPlus,
    IconTrash,
} from '@/components/icons';
import {
    FIELD_MASKS,
    FIELD_TYPE_GROUPS,
    FieldMask,
    SensitivityLevel,
    fieldTypeLabel,
    resolveFieldType,
    type FieldDefinition,
    type FieldType,
} from '@/types/schema';
import { sensitivityChoices, sensitivityMeta } from '@/types/content';
import { getContractServerState, getContractState, subscribeToContract } from '@/lib/api-contract';
import { OptionsEditor } from '@/components/schema/options-editor';
import { TOKEN_LENGTH, editorsFor, rolesFor } from '@/lib/field-presentation';
import { fieldFormSchema, numberText } from '@/lib/field-form';
import { dropIndex, move } from '@/lib/blocks';
import { cn } from '@/lib/utils';

interface FieldEditorProps {
    fields: FieldDefinition[];
    onChange: (fields: FieldDefinition[]) => void;
    /**
     * The content types a reference field can point at, offered as suggestions. Left off, the
     * target is typed by its API name.
     */
    contentTypes?: { name: string; displayName: string }[];
    /**
     * Told whether a field form is open. An open form holds edits `fields` does not have yet, so a
     * page that sends `fields` should not send them while one is open.
     */
    onEditingChange?: (editing: boolean) => void;
}

/** A Select item cannot carry an empty value, so "none" is spelled with this. */
const NONE = '__none';

function toPascalCase(input: string): string {
    return input
        .replace(/[^A-Za-z0-9\s_-]/g, '')
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join('');
}

// The API refuses each of these members on a type it does not belong to, so they go when the type
// changes: options on anything but choice, multiple on anything but choice and reference, a target
// on anything but reference, a currency on anything but money, a length on anything but token, and
// an editor or role the new type cannot hold.
function withType(field: FieldDefinition, type: FieldType): FieldDefinition {
    const next: FieldDefinition = { ...field, type };
    if (type === 'choice') {
        next.options = field.options?.length ? field.options : [{ value: '', label: '' }];
        next.multiple = field.multiple ?? false;
    } else {
        delete next.options;
    }
    if (type !== 'choice' && type !== 'reference') delete next.multiple;
    if (type !== 'reference') delete next.referenceType;
    if (type !== 'money') {
        delete next.currency;
        delete next.scale;
    }
    if (type === 'token') {
        // The server fills a token, so nothing can require one, and it is never Public.
        next.isRequired = false;
        if (!next.sensitivity || next.sensitivity === SensitivityLevel.Public) {
            next.sensitivity = SensitivityLevel.Hidden;
        }
    } else {
        delete next.tokenLength;
    }
    if (next.editor && !editorsFor(type).some((e) => e.name === next.editor)) delete next.editor;
    if (next.role && !rolesFor(type).some((r) => r.name === next.role)) delete next.role;
    return next;
}

/**
 * The field as it is sent: optional members left blank are left out, not sent empty, and members
 * its type cannot hold are dropped once more, whatever the form kept for an input it unmounted.
 */
function cleaned(field: FieldDefinition): FieldDefinition {
    // By the type the alias stands for, keeping the alias the definition was written with.
    const next = { ...withType(field, resolveFieldType(field.type) ?? 'string'), type: field.type };
    for (const key of Object.keys(next) as (keyof FieldDefinition)[]) {
        if (next[key] === undefined) delete next[key];
    }
    if (!next.section) delete next.section;
    if (!next.editor) delete next.editor;
    if (!next.role) delete next.role;
    if (!next.currency) {
        delete next.currency;
        delete next.scale;
    }
    if (next.scale === null || next.scale === undefined) delete next.scale;
    if (next.tokenLength === null || next.tokenLength === undefined) delete next.tokenLength;
    if (next.referenceType !== undefined) next.referenceType = next.referenceType.trim();
    // The API refuses a Members field that carries roles or a mask, and the form hides both for it.
    if (next.sensitivity === SensitivityLevel.Members) {
        next.visibleToRoles = [];
        next.mask = FieldMask.Default;
    }
    return next;
}

const textNumber = (text: string) => (text.trim() === '' ? null : Number(text));

const EMPTY_FIELD: FieldDefinition = {
    name: '',
    displayName: '',
    type: 'string',
    isRequired: false,
    sensitivity: SensitivityLevel.Public,
    visibleToRoles: [],
    mask: FieldMask.Default,
};

export function FieldEditor({ fields, onChange, contentTypes, onEditingChange }: FieldEditorProps) {
    // One field open at a time: an index into `fields`, NEW for the form that adds one, or nothing.
    const [open, setOpen] = useState<number | typeof NEW | null>(null);
    const [announcement, setAnnouncement] = useState('');
    const [focus, setFocus] = useState<{ name: string; action: 'up' | 'down' } | null>(null);
    const listId = useId();
    const listRef = useRef<HTMLUListElement>(null);

    const editing = open !== null;
    useEffect(() => {
        onEditingChange?.(editing);
    }, [editing, onEditingChange]);

    // A row that moves is put back into the DOM, which takes the focus off the button that moved
    // it. Put it back on that button, or on the other one once the row reaches an end.
    useEffect(() => {
        if (!focus) return;
        const row = listRef.current?.querySelector(`:scope > [data-field-key="${focus.name}"]`);
        const target =
            row?.querySelector<HTMLElement>(`[data-action="${focus.action}"]:not(:disabled)`) ??
            row?.querySelector<HTMLElement>('[data-action]:not(:disabled)');
        target?.focus();
    }, [focus]);

    const save = (index: number | typeof NEW, field: FieldDefinition) => {
        const next = [...fields];
        if (index === NEW) next.push(cleaned(field));
        else next[index] = cleaned(field);
        onChange(next);
        setOpen(null);
    };

    const remove = (index: number) => {
        onChange(fields.filter((_, i) => i !== index));
        if (open === index) setOpen(null);
        else if (typeof open === 'number' && open > index) setOpen(open - 1);
    };

    const moveField = (from: number, to: number, how: 'up' | 'down' | 'drag') => {
        const next = move(fields, from, to);
        if (next === fields) return;
        onChange(next);
        // The open row follows its field rather than staying at the position it was in.
        if (open === from) setOpen(to);
        else if (typeof open === 'number' && open >= Math.min(from, to) && open <= Math.max(from, to)) {
            setOpen(from < to ? open - 1 : open + 1);
        }
        if (how !== 'drag') setFocus({ name: fields[from].name, action: how });
        setAnnouncement(`${fields[from].displayName} moved to position ${to + 1} of ${fields.length}`);
    };

    const newForm = (
        <div role="group" aria-label="New field" className="rounded-lg border p-4">
            <FieldForm
                key="new"
                initial={EMPTY_FIELD}
                isNew
                others={fields}
                contentTypes={contentTypes}
                onSave={(field) => save(NEW, field)}
                onCancel={() => setOpen(null)}
            />
        </div>
    );

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Fields</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(NEW)}>
                    <IconPlus />
                    Add field
                </Button>
            </div>

            {fields.length === 0 && open !== NEW ? (
                <EmptyState
                    icon={IconContentTypes}
                    title="No fields yet"
                    description="Every entry of this type will have the fields you define here."
                    action={
                        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(NEW)}>
                            <IconPlus />
                            Add field
                        </Button>
                    }
                />
            ) : fields.length > 0 ? (
                <ul ref={listRef} aria-label="Fields" className="divide-y rounded-lg border">
                    {fields.map((field, index) => (
                        <FieldRow
                            key={field.name}
                            field={field}
                            index={index}
                            count={fields.length}
                            listId={listId}
                            open={open === index}
                            onToggle={() => setOpen(open === index ? null : index)}
                            onMove={moveField}
                            onRemove={() => remove(index)}
                        >
                            <FieldForm
                                initial={field}
                                isNew={false}
                                others={fields.filter((_, i) => i !== index)}
                                contentTypes={contentTypes}
                                onSave={(saved) => save(index, saved)}
                                onCancel={() => setOpen(null)}
                            />
                        </FieldRow>
                    ))}
                </ul>
            ) : null}

            {open === NEW && newForm}

            <p aria-live="polite" className="sr-only">
                {announcement}
            </p>
        </div>
    );
}

/** The open state that means "the form adding a field", as against the index of one being edited. */
const NEW = 'new';

/**
 * One field as a row: what it is, how sensitive it is and how it is masked, all without opening it.
 * Open, the row holds the field's form below that line.
 *
 * Reordered by dragging the handle, or with the two move buttons, which are the keyboard's way and
 * what the handle stands for: the handle is hidden from assistive technology for that reason.
 */
function FieldRow({
    field,
    index,
    count,
    listId,
    open,
    onToggle,
    onMove,
    onRemove,
    children,
}: {
    field: FieldDefinition;
    index: number;
    count: number;
    listId: string;
    open: boolean;
    onToggle: () => void;
    onMove: (from: number, to: number, how: 'up' | 'down' | 'drag') => void;
    onRemove: () => void;
    children: ReactNode;
}) {
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

    const sensitivity = field.sensitivity ?? SensitivityLevel.Public;
    const mask = FIELD_MASKS.find((m) => m.value === (field.mask ?? FieldMask.Default));
    const formId = `${listId}-field-${index}`;

    return (
        <li ref={rowRef} data-field-key={field.name} className={cn('relative', dragging && 'opacity-50')}>
            {edge && (
                <div
                    aria-hidden="true"
                    className={cn('bg-primary absolute inset-x-0 h-0.5', edge === 'top' ? '-top-px' : '-bottom-px')}
                />
            )}
            <div className="flex items-center gap-3 px-4 py-3">
                <span
                    ref={handleRef}
                    aria-hidden="true"
                    title="Drag to reorder"
                    data-drag-handle
                    className="text-muted-foreground cursor-grab"
                >
                    <IconMore className="size-4 rotate-90" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{field.displayName}</span>
                        {field.isRequired && (
                            <Badge variant="secondary" className="text-xs">
                                Required
                            </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                            {sensitivityMeta(sensitivity).label}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                        <code className="font-mono">{field.name}</code> · {fieldTypeLabel(field.type)}
                        {field.multiple ? ', several' : ''}
                        {field.currency ? ` in ${field.currency}` : ''}
                        {field.section ? ` · ${field.section}` : ''}
                    </p>
                    {sensitivity !== SensitivityLevel.Public && sensitivity !== SensitivityLevel.Members && (
                        <p className="text-muted-foreground text-xs">
                            Mask: {mask?.label}
                            {field.visibleToRoles?.length ? ` · Visible to ${field.visibleToRoles.join(', ')}` : ''}
                        </p>
                    )}
                </div>
                <div className="flex flex-col">
                    <button
                        type="button"
                        data-action="up"
                        onClick={() => onMove(index, index - 1, 'up')}
                        disabled={index === 0}
                        aria-label={`Move ${field.displayName} up`}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                        <IconChevronDown className="size-3 rotate-180" />
                    </button>
                    <button
                        type="button"
                        data-action="down"
                        onClick={() => onMove(index, index + 1, 'down')}
                        disabled={index === count - 1}
                        aria-label={`Move ${field.displayName} down`}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                        <IconChevronDown className="size-3" />
                    </button>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onToggle}
                    aria-expanded={open}
                    aria-controls={formId}
                    aria-label={`Edit ${field.displayName}`}
                >
                    <IconPen className="size-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onRemove}
                    aria-label={`Remove ${field.displayName}`}
                    className="text-destructive hover:text-destructive"
                >
                    <IconTrash className="size-3.5" />
                </Button>
            </div>
            {open && (
                <div id={formId} role="group" aria-label={`Edit ${field.displayName}`} className="border-t px-4 py-4">
                    {children}
                </div>
            )}
        </li>
    );
}

interface FieldFormProps {
    initial: FieldDefinition;
    isNew: boolean;
    /** The type's other fields, which a name and a role have to be unique across. */
    others: FieldDefinition[];
    contentTypes?: { name: string; displayName: string }[];
    onSave: (field: FieldDefinition) => void;
    onCancel: () => void;
}

/**
 * One field's form. The pattern for a form in this console: react-hook-form holds the values, one
 * zod schema holds the rules (src/lib/field-form.ts), and the values are read through useWatch and
 * useFormState rather than watch() and formState, which React Compiler cannot see change.
 */
function FieldForm({ initial, isNew, others, contentTypes, onSave, onCancel }: FieldFormProps) {
    const { control, register, getValues, setValue, reset, trigger, handleSubmit } = useForm<FieldDefinition>({
        defaultValues: initial,
        resolver: zodResolver(fieldFormSchema(others)),
        mode: 'onChange',
    });
    const form = useWatch({ control }) as FieldDefinition;
    const contract = useSyncExternalStore(subscribeToContract, getContractState, getContractServerState);
    const { errors, isValid } = useFormState({ control });

    const resolvedType = resolveFieldType(form.type);
    const isChoice = resolvedType === 'choice';
    const isReference = resolvedType === 'reference';
    const isMoney = resolvedType === 'money';
    const isToken = resolvedType === 'token';
    const editors = editorsFor(form.type);
    const roles = rolesFor(form.type);

    // A type change rewrites several members at once (see withType), so the form starts again from
    // the rewritten field and checks all of it.
    const changeType = (type: FieldType) => {
        reset(withType(getValues(), type), { keepDefaultValues: true });
        void trigger();
    };

    // The form sits inside the page's own form, not in a dialog, so Enter in one of its inputs would
    // submit the page and create the type around a half-typed field. Here Enter does nothing. A
    // native listener rather than onKeyDown, since this wrapper is not itself a control.
    const rootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const swallowEnter = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
        };
        root.addEventListener('keydown', swallowEnter);
        return () => root.removeEventListener('keydown', swallowEnter);
    }, []);

    return (
        <div ref={rootRef}>
            <div className="space-y-4 py-2">
                <div className="space-y-2">
                    <Label htmlFor="field-display-name">Display name</Label>
                    <Controller
                        control={control}
                        name="displayName"
                        render={({ field }) => (
                            <Input
                                id="field-display-name"
                                ref={field.ref}
                                name={field.name}
                                value={field.value ?? ''}
                                onBlur={field.onBlur}
                                placeholder="Publish date"
                                onChange={(e) => {
                                    const before = field.value ?? '';
                                    field.onChange(e.target.value);
                                    // Keep the API name in sync until the user edits it directly.
                                    const name = getValues('name');
                                    if (isNew && (name === '' || name === toPascalCase(before))) {
                                        setValue('name', toPascalCase(e.target.value), { shouldValidate: true });
                                    }
                                }}
                            />
                        )}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="field-name">Field name (API)</Label>
                    <Input id="field-name" placeholder="PublishDate" className="font-mono" {...register('name')} />
                    {form.name && errors.name?.message && (
                        <p className="text-destructive text-xs">{errors.name.message}</p>
                    )}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="field-type">Type</Label>
                    <Select
                        // A definition can carry an alias ('integer' for 'int'), which is not a
                        // value the picker offers, so an unresolved one would show as empty.
                        value={resolveFieldType(form.type) ?? 'string'}
                        onValueChange={(value) => changeType(value as FieldType)}
                    >
                        <SelectTrigger id="field-type" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {FIELD_TYPE_GROUPS.map((group) => (
                                <SelectGroup key={group.label}>
                                    <SelectLabel>{group.label}</SelectLabel>
                                    {group.types.map((type) => (
                                        <SelectItem key={type.value} value={type.value}>
                                            <span className="font-medium">{type.label}</span>
                                            <span className="text-muted-foreground ml-1.5 text-xs">
                                                {type.description}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {isChoice && (
                    <>
                        <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
                            <div className="space-y-0.5">
                                <Label htmlFor="field-multiple">Holds several values</Label>
                                <p className="text-muted-foreground text-xs">
                                    Checkboxes instead of one pick. This cannot be changed later.
                                </p>
                            </div>
                            <Controller
                                control={control}
                                name="multiple"
                                render={({ field }) => (
                                    <Switch
                                        id="field-multiple"
                                        checked={field.value ?? false}
                                        onCheckedChange={field.onChange}
                                    />
                                )}
                            />
                        </div>
                        <fieldset className="space-y-2">
                            <legend className="text-sm font-medium">Options</legend>
                            <Controller
                                control={control}
                                name="options"
                                render={({ field }) => (
                                    <OptionsEditor options={field.value ?? []} onChange={field.onChange} />
                                )}
                            />
                        </fieldset>
                    </>
                )}
                {isReference && (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="field-reference-type">Points at (content type)</Label>
                            <Input
                                id="field-reference-type"
                                placeholder="author"
                                className="font-mono"
                                list={contentTypes?.length ? 'field-reference-types' : undefined}
                                {...register('referenceType')}
                            />
                            {contentTypes?.length ? (
                                <datalist id="field-reference-types">
                                    {contentTypes.map((t) => (
                                        <option key={t.name} value={t.name}>
                                            {t.displayName}
                                        </option>
                                    ))}
                                </datalist>
                            ) : null}
                            {!form.referenceType?.trim() && (
                                <p className="text-muted-foreground text-xs">
                                    The API name of the type the entries are picked from.
                                </p>
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
                            <div className="space-y-0.5">
                                <Label htmlFor="field-reference-multiple">Holds several entries</Label>
                                <p className="text-muted-foreground text-xs">
                                    A list of up to 100 entries, in the order they are picked.
                                </p>
                            </div>
                            <Controller
                                control={control}
                                name="multiple"
                                render={({ field }) => (
                                    <Switch
                                        id="field-reference-multiple"
                                        checked={field.value ?? false}
                                        onCheckedChange={field.onChange}
                                    />
                                )}
                            />
                        </div>
                    </>
                )}
                {isMoney && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="field-currency">Currency</Label>
                            <Controller
                                control={control}
                                name="currency"
                                render={({ field }) => (
                                    <Input
                                        id="field-currency"
                                        ref={field.ref}
                                        name={field.name}
                                        value={field.value ?? ''}
                                        onBlur={field.onBlur}
                                        placeholder="USD"
                                        maxLength={3}
                                        className="font-mono"
                                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                    />
                                )}
                            />
                            <p className="text-muted-foreground text-xs">
                                Leave empty for a plain number. Nothing is rounded: an amount with too
                                many decimal places is refused.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="field-scale">Decimal places</Label>
                            <Controller
                                control={control}
                                name="scale"
                                // Its rule is filed under currency, so a change here checks that.
                                rules={{ deps: ['currency'] }}
                                render={({ field }) => (
                                    <Input
                                        id="field-scale"
                                        ref={field.ref}
                                        name={field.name}
                                        type="number"
                                        min={0}
                                        max={8}
                                        step={1}
                                        value={numberText(field.value)}
                                        onBlur={field.onBlur}
                                        placeholder="The currency's own"
                                        onChange={(e) => field.onChange(textNumber(e.target.value))}
                                    />
                                )}
                            />
                        </div>
                        {errors.currency?.message && (
                            <p className="text-destructive text-xs sm:col-span-2">{errors.currency.message}</p>
                        )}
                    </div>
                )}
                {isToken && (
                    <div className="space-y-2">
                        <Label htmlFor="field-token-length">Token length</Label>
                        <Controller
                            control={control}
                            name="tokenLength"
                            render={({ field }) => (
                                <Input
                                    id="field-token-length"
                                    ref={field.ref}
                                    name={field.name}
                                    type="number"
                                    min={TOKEN_LENGTH.min}
                                    max={TOKEN_LENGTH.max}
                                    step={1}
                                    value={numberText(field.value)}
                                    onBlur={field.onBlur}
                                    placeholder={String(TOKEN_LENGTH.default)}
                                    onChange={(e) => field.onChange(textNumber(e.target.value))}
                                />
                            )}
                        />
                        <p className="text-muted-foreground text-xs">
                            The server generates the token when an entry is created, and nobody can set
                            or change it. A token is never public.
                        </p>
                        {errors.tokenLength?.message && (
                            <p className="text-destructive text-xs">{errors.tokenLength.message}</p>
                        )}
                    </div>
                )}
                {!isToken && (
                    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                        <Label htmlFor="field-required">Required</Label>
                        <Controller
                            control={control}
                            name="isRequired"
                            render={({ field }) => (
                                <Switch id="field-required" checked={field.value} onCheckedChange={field.onChange} />
                            )}
                        />
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="field-section">Section</Label>
                        <Input id="field-section" placeholder="Details" {...register('section')} />
                        <p className="text-muted-foreground text-xs">
                            Fields with the same section are grouped on the edit screen. Leave empty for
                            none.
                        </p>
                        {errors.section?.message && (
                            <p className="text-destructive text-xs">{errors.section.message}</p>
                        )}
                    </div>
                    {editors.length > 0 && (
                        <div className="space-y-2">
                            <Label htmlFor="field-editor-hint">Editor</Label>
                            <Controller
                                control={control}
                                name="editor"
                                render={({ field }) => (
                                    <Select
                                        value={field.value ?? NONE}
                                        onValueChange={(value) => field.onChange(value === NONE ? null : value)}
                                    >
                                        <SelectTrigger id="field-editor-hint" className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={NONE}>Pick by type and name</SelectItem>
                                            {editors.map((e) => (
                                                <SelectItem key={e.name} value={e.name}>
                                                    {e.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                    )}
                    {roles.length > 0 && (
                        <div className="space-y-2">
                            <Label htmlFor="field-role">Role</Label>
                            <Controller
                                control={control}
                                name="role"
                                render={({ field }) => (
                                    <Select
                                        value={field.value ?? NONE}
                                        onValueChange={(value) => field.onChange(value === NONE ? null : value)}
                                    >
                                        <SelectTrigger id="field-role" className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={NONE}>None</SelectItem>
                                            {roles.map((r) => (
                                                <SelectItem key={r.name} value={r.name}>
                                                    {r.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            {errors.role?.message && <p className="text-destructive text-xs">{errors.role.message}</p>}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="field-sensitivity">Sensitivity</Label>
                    <Controller
                        control={control}
                        name="sensitivity"
                        render={({ field }) => (
                            <Select
                                value={String(field.value ?? SensitivityLevel.Public)}
                                onValueChange={(value) => field.onChange(value as SensitivityLevel)}
                            >
                                <SelectTrigger id="field-sensitivity" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {sensitivityChoices(
                                        contract,
                                        isToken
                                            ? [SensitivityLevel.Sensitive, SensitivityLevel.Hidden]
                                            : [
                                                  SensitivityLevel.Public,
                                                  SensitivityLevel.Members,
                                                  SensitivityLevel.Sensitive,
                                                  SensitivityLevel.Hidden,
                                              ],
                                        field.value,
                                    ).map((level) => (
                                        <SelectItem key={level} value={String(level)}>
                                            <span className="font-medium">{sensitivityMeta(level).label}</span>
                                            <span className="text-muted-foreground ml-1.5 text-xs">
                                                {sensitivityMeta(level).description}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    />
                </div>

                {form.sensitivity !== undefined &&
                    form.sensitivity !== SensitivityLevel.Public &&
                    form.sensitivity !== SensitivityLevel.Members && (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="field-roles">Visible to roles</Label>
                            <Controller
                                control={control}
                                name="visibleToRoles"
                                render={({ field }) => (
                                    <Input
                                        id="field-roles"
                                        ref={field.ref}
                                        name={field.name}
                                        value={(field.value ?? []).join(', ')}
                                        onBlur={field.onBlur}
                                        placeholder="Admin, HR"
                                        onChange={(e) =>
                                            field.onChange(
                                                e.target.value
                                                    .split(',')
                                                    .map((r) => r.trim())
                                                    .filter(Boolean)
                                            )
                                        }
                                    />
                                )}
                            />
                            <p className="text-muted-foreground text-xs">
                                {/* The specific default used to be spelled out here as
                                    "Sensitive to HR; Hidden to SuperAdmin only". That is server
                                    policy transcribed into the client: it goes stale silently
                                    when the server changes, and #272 replaces role names with
                                    capabilities outright. Describe the behaviour, name no
                                    roles, and let the server keep the policy. */}
                                Comma-separated. Leave empty to use the default policy the server applies for
                                this sensitivity level.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="field-mask">Mask</Label>
                            <Controller
                                control={control}
                                name="mask"
                                render={({ field }) => (
                                    <Select
                                        value={String(field.value ?? FieldMask.Default)}
                                        onValueChange={(value) => field.onChange(value as FieldMask)}
                                    >
                                        <SelectTrigger id="field-mask" className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {FIELD_MASKS.map((m) => (
                                                <SelectItem key={m.value} value={String(m.value)}>
                                                    {m.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                    </>
                )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="button" onClick={handleSubmit(onSave)} disabled={!isValid || Object.keys(errors).length > 0}>
                    {isNew ? 'Add field' : 'Save field'}
                </Button>
            </div>
        </div>
    );
}
