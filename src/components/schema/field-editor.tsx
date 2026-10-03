'use client';

import { useState } from 'react';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/patterns/empty-state';
import {
    IconChevronDown,
    IconContentTypes,
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
import { SENSITIVITY_META } from '@/types/content';
import { OptionsEditor } from '@/components/schema/options-editor';
import { hasOptionIssues, optionIssues } from '@/lib/choice';
import {
    TOKEN_LENGTH,
    currencyProblem,
    editorsFor,
    rolesFor,
    sectionProblem,
    tokenLengthProblem,
} from '@/lib/field-presentation';

interface FieldEditorProps {
    fields: FieldDefinition[];
    onChange: (fields: FieldDefinition[]) => void;
    /**
     * The content types a reference field can point at, offered as suggestions. Left off, the
     * target is typed by its API name.
     */
    contentTypes?: { name: string; displayName: string }[];
}

/** A Select item cannot carry an empty value, so "none" is spelled with this. */
const NONE = '__none';

// The backend requires PascalCase field names (FieldTypeValidator).
function toPascalCase(input: string): string {
    return input
        .replace(/[^A-Za-z0-9\s_-]/g, '')
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join('');
}

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

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

/** The field as it is sent: optional members left blank are left out, not sent empty. */
function cleaned(field: FieldDefinition): FieldDefinition {
    const next = { ...field };
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
    return next;
}

const numberText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
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

export function FieldEditor({ fields, onChange, contentTypes }: FieldEditorProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [form, setForm] = useState<FieldDefinition>(EMPTY_FIELD);

    const nameIsValid = PASCAL_CASE.test(form.name);
    const nameIsDuplicate = fields.some(
        (f, i) => f.name === form.name && i !== editingIndex
    );
    const resolvedType = resolveFieldType(form.type);
    const isChoice = resolvedType === 'choice';
    const isReference = resolvedType === 'reference';
    const isMoney = resolvedType === 'money';
    const isToken = resolvedType === 'token';
    const optionsInvalid = isChoice && hasOptionIssues(optionIssues(form.options ?? []));
    const editors = editorsFor(form.type);
    const roles = rolesFor(form.type);
    const sectionIssue = sectionProblem(form.section ?? '');
    const currencyIssue = isMoney ? currencyProblem(form.currency ?? '', numberText(form.scale)) : null;
    const tokenIssue = isToken ? tokenLengthProblem(numberText(form.tokenLength)) : null;
    const roleHolder = form.role
        ? fields.find((f, i) => f.role === form.role && i !== editingIndex)
        : undefined;
    // The API refuses a reference that names no target, so the dialog does too.
    const targetMissing = isReference && !form.referenceType?.trim();
    const canSave =
        form.name &&
        form.displayName &&
        nameIsValid &&
        !nameIsDuplicate &&
        !optionsInvalid &&
        !sectionIssue &&
        !currencyIssue &&
        !tokenIssue &&
        !roleHolder &&
        !targetMissing;

    const openNew = () => {
        setForm(EMPTY_FIELD);
        setEditingIndex(null);
        setIsDialogOpen(true);
    };

    const openEdit = (index: number) => {
        setForm(fields[index]);
        setEditingIndex(index);
        setIsDialogOpen(true);
    };

    const save = () => {
        if (!canSave) return;
        const next = [...fields];
        if (editingIndex !== null) next[editingIndex] = cleaned(form);
        else next.push(cleaned(form));
        onChange(next);
        setIsDialogOpen(false);
    };

    const remove = (index: number) => {
        onChange(fields.filter((_, i) => i !== index));
    };

    const move = (index: number, delta: -1 | 1) => {
        const target = index + delta;
        if (target < 0 || target >= fields.length) return;
        const next = [...fields];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Fields</h3>
                <Button type="button" variant="outline" size="sm" onClick={openNew}>
                    <IconPlus />
                    Add field
                </Button>
            </div>

            {fields.length === 0 ? (
                <EmptyState
                    icon={IconContentTypes}
                    title="No fields yet"
                    description="Every entry of this type will have the fields you define here."
                    action={
                        <Button type="button" variant="outline" size="sm" onClick={openNew}>
                            <IconPlus />
                            Add field
                        </Button>
                    }
                />
            ) : (
                <ul className="divide-y rounded-lg border">
                    {fields.map((field, index) => (
                        <li key={field.name} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex flex-col">
                                <button
                                    type="button"
                                    onClick={() => move(index, -1)}
                                    disabled={index === 0}
                                    aria-label={`Move ${field.displayName} up`}
                                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                                >
                                    <IconChevronDown className="size-3 rotate-180" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => move(index, 1)}
                                    disabled={index === fields.length - 1}
                                    aria-label={`Move ${field.displayName} down`}
                                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                                >
                                    <IconChevronDown className="size-3" />
                                </button>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium">{field.displayName}</span>
                                    {field.isRequired && (
                                        <Badge variant="secondary" className="text-xs">
                                            Required
                                        </Badge>
                                    )}
                                    {field.sensitivity !== undefined && field.sensitivity !== SensitivityLevel.Public && (
                                        <Badge variant="outline" className="text-xs">
                                            {SENSITIVITY_META[field.sensitivity].label}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-muted-foreground text-xs">
                                    <code className="font-mono">{field.name}</code> · {fieldTypeLabel(field.type)}
                                    {field.multiple ? ', several' : ''}
                                    {field.currency ? ` in ${field.currency}` : ''}
                                    {field.section ? ` · ${field.section}` : ''}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => openEdit(index)}
                                aria-label={`Edit ${field.displayName}`}
                            >
                                <IconPen className="size-3.5" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => remove(index)}
                                aria-label={`Remove ${field.displayName}`}
                                className="text-destructive hover:text-destructive"
                            >
                                <IconTrash className="size-3.5" />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingIndex !== null ? 'Edit field' : 'Add field'}</DialogTitle>
                        <DialogDescription>
                            The field name is how the API stores the value; the display name is what editors see.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="field-display-name">Display name</Label>
                            <Input
                                id="field-display-name"
                                value={form.displayName}
                                placeholder="Publish date"
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        displayName: e.target.value,
                                        // Keep the API name in sync until the user edits it directly.
                                        name:
                                            editingIndex === null && (f.name === '' || f.name === toPascalCase(f.displayName))
                                                ? toPascalCase(e.target.value)
                                                : f.name,
                                    }))
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="field-name">Field name (API)</Label>
                            <Input
                                id="field-name"
                                value={form.name}
                                placeholder="PublishDate"
                                className="font-mono"
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            />
                            {form.name && !nameIsValid && (
                                <p className="text-destructive text-xs">
                                    Use PascalCase — start with a capital letter, letters and numbers only.
                                </p>
                            )}
                            {nameIsDuplicate && (
                                <p className="text-destructive text-xs">A field with this name already exists.</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="field-type">Type</Label>
                            <Select
                                // A definition can carry an alias ('integer' for 'int'), which is not a
                                // value the picker offers, so an unresolved one would show as empty.
                                value={resolveFieldType(form.type) ?? 'string'}
                                onValueChange={(value) => setForm((f) => withType(f, value as FieldType))}
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
                                    <Switch
                                        id="field-multiple"
                                        checked={form.multiple ?? false}
                                        onCheckedChange={(checked) => setForm((f) => ({ ...f, multiple: checked }))}
                                    />
                                </div>
                                <fieldset className="space-y-2">
                                    <legend className="text-sm font-medium">Options</legend>
                                    <OptionsEditor
                                        options={form.options ?? []}
                                        onChange={(options) => setForm((f) => ({ ...f, options }))}
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
                                        value={form.referenceType ?? ''}
                                        placeholder="author"
                                        className="font-mono"
                                        list={contentTypes?.length ? 'field-reference-types' : undefined}
                                        onChange={(e) => setForm((f) => ({ ...f, referenceType: e.target.value }))}
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
                                    {targetMissing && (
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
                                    <Switch
                                        id="field-reference-multiple"
                                        checked={form.multiple ?? false}
                                        onCheckedChange={(checked) => setForm((f) => ({ ...f, multiple: checked }))}
                                    />
                                </div>
                            </>
                        )}
                        {isMoney && (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="field-currency">Currency</Label>
                                    <Input
                                        id="field-currency"
                                        value={form.currency ?? ''}
                                        placeholder="USD"
                                        maxLength={3}
                                        className="font-mono"
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))
                                        }
                                    />
                                    <p className="text-muted-foreground text-xs">
                                        Leave empty for a plain number. Nothing is rounded: an amount with too
                                        many decimal places is refused.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="field-scale">Decimal places</Label>
                                    <Input
                                        id="field-scale"
                                        type="number"
                                        min={0}
                                        max={8}
                                        step={1}
                                        value={numberText(form.scale)}
                                        placeholder="The currency's own"
                                        onChange={(e) => setForm((f) => ({ ...f, scale: textNumber(e.target.value) }))}
                                    />
                                </div>
                                {currencyIssue && (
                                    <p className="text-destructive text-xs sm:col-span-2">{currencyIssue}</p>
                                )}
                            </div>
                        )}
                        {isToken && (
                            <div className="space-y-2">
                                <Label htmlFor="field-token-length">Token length</Label>
                                <Input
                                    id="field-token-length"
                                    type="number"
                                    min={TOKEN_LENGTH.min}
                                    max={TOKEN_LENGTH.max}
                                    step={1}
                                    value={numberText(form.tokenLength)}
                                    placeholder={String(TOKEN_LENGTH.default)}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, tokenLength: textNumber(e.target.value) }))
                                    }
                                />
                                <p className="text-muted-foreground text-xs">
                                    The server generates the token when an entry is created, and nobody can set
                                    or change it. A token is never public.
                                </p>
                                {tokenIssue && <p className="text-destructive text-xs">{tokenIssue}</p>}
                            </div>
                        )}
                        {!isToken && (
                            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                                <Label htmlFor="field-required">Required</Label>
                                <Switch
                                    id="field-required"
                                    checked={form.isRequired}
                                    onCheckedChange={(checked) => setForm((f) => ({ ...f, isRequired: checked }))}
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="field-section">Section</Label>
                                <Input
                                    id="field-section"
                                    value={form.section ?? ''}
                                    placeholder="Details"
                                    onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                                />
                                <p className="text-muted-foreground text-xs">
                                    Fields with the same section are grouped on the edit screen. Leave empty for
                                    none.
                                </p>
                                {sectionIssue && <p className="text-destructive text-xs">{sectionIssue}</p>}
                            </div>
                            {editors.length > 0 && (
                                <div className="space-y-2">
                                    <Label htmlFor="field-editor-hint">Editor</Label>
                                    <Select
                                        value={form.editor ?? NONE}
                                        onValueChange={(value) =>
                                            setForm((f) => ({ ...f, editor: value === NONE ? null : value }))
                                        }
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
                                </div>
                            )}
                            {roles.length > 0 && (
                                <div className="space-y-2">
                                    <Label htmlFor="field-role">Role</Label>
                                    <Select
                                        value={form.role ?? NONE}
                                        onValueChange={(value) =>
                                            setForm((f) => ({ ...f, role: value === NONE ? null : value }))
                                        }
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
                                    {roleHolder && (
                                        <p className="text-destructive text-xs">
                                            {roleHolder.displayName} already holds this role. One field of a type
                                            holds a role.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Sensitivity</Label>
                            <Select
                                value={String(form.sensitivity ?? SensitivityLevel.Public)}
                                onValueChange={(value) =>
                                    setForm((f) => ({ ...f, sensitivity: value as SensitivityLevel }))
                                }
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(isToken
                                        ? [SensitivityLevel.Sensitive, SensitivityLevel.Hidden]
                                        : [SensitivityLevel.Public, SensitivityLevel.Sensitive, SensitivityLevel.Hidden]
                                    ).map(
                                        (level) => (
                                            <SelectItem key={level} value={String(level)}>
                                                <span className="font-medium">{SENSITIVITY_META[level].label}</span>
                                                <span className="text-muted-foreground ml-1.5 text-xs">
                                                    {SENSITIVITY_META[level].description}
                                                </span>
                                            </SelectItem>
                                        )
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        {form.sensitivity !== undefined && form.sensitivity !== SensitivityLevel.Public && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="field-roles">Visible to roles</Label>
                                    <Input
                                        id="field-roles"
                                        value={(form.visibleToRoles ?? []).join(', ')}
                                        placeholder="Admin, HR"
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                visibleToRoles: e.target.value
                                                    .split(',')
                                                    .map((r) => r.trim())
                                                    .filter(Boolean),
                                            }))
                                        }
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
                                    <Label>Mask</Label>
                                    <Select
                                        value={String(form.mask ?? FieldMask.Default)}
                                        onValueChange={(value) =>
                                            setForm((f) => ({ ...f, mask: value as FieldMask }))
                                        }
                                    >
                                        <SelectTrigger className="w-full">
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
                                </div>
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={save} disabled={!canSave}>
                            {editingIndex !== null ? 'Save field' : 'Add field'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}