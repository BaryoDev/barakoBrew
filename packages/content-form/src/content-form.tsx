'use client';

import { useState, type ReactNode } from 'react';
import { Input, Label, Switch, Textarea, FieldError, cn } from './ui';
import { fieldIsVisibleTo, maskedNotice } from './sensitivity';
import { resolveFieldType, type FieldDefinition, type FieldType } from './definition';

/** What a host control is handed when it takes a field over. */
export interface FieldRenderProps {
    field: FieldDefinition;
    /** The field's type with aliases resolved, or undefined for a type this package cannot name. */
    type: FieldType | undefined;
    label: ReactNode;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
}

export interface ContentFormProps {
    fields: FieldDefinition[];
    values: Record<string, unknown>;
    onChange: (values: Record<string, unknown>) => void;
    errors?: Record<string, string>;
    /**
     * The roles of the person at the screen, which is what decides whether a sensitive field is
     * editable. Required rather than optional: a consumer that has to remember to pass it is a
     * consumer that will forget, and forgetting means drawing an editable box over a value the API
     * will not let them change.
     */
    viewerRoles: readonly string[];
    /**
     * Lets the host draw a field itself, for a control needing data this package does not fetch:
     * a reference picker, a block editor, a menu tree. Return null to take the default.
     *
     * A field the viewer may not read never gets here. Sensitivity is settled before this is
     * called, so a host control cannot skip it.
     */
    renderField?: (props: FieldRenderProps) => ReactNode | null;
    /** What to say when the definition has no fields at all. */
    emptyMessage?: ReactNode;
}

/**
 * Draws an editing form from a content type definition.
 *
 * One control per field type. The accepted set is defined server-side in FieldTypeRegistry; each
 * type here maps to a sensible input (native pickers for dates and times, typed inputs for email
 * and url, a JSON editor for structured data).
 */
export function ContentForm({
    fields,
    values,
    onChange,
    errors,
    viewerRoles,
    renderField,
    emptyMessage,
}: ContentFormProps) {
    // Undefined removes the key, so a cleared optional value is left out of the save rather than
    // sent as an empty string the API would check against the field's type.
    const setField = (name: string, value: unknown) => {
        if (value === undefined) {
            const next = { ...values };
            delete next[name];
            onChange(next);
            return;
        }
        onChange({ ...values, [name]: value });
    };

    if (fields.length === 0) {
        return (
            <p className="text-muted-foreground py-8 text-center text-sm">
                {emptyMessage ??
                    'This content type has no fields yet. Add fields to its definition first.'}
            </p>
        );
    }

    return (
        <div className="space-y-5">
            {fields.map((field) => (
                <FieldControl
                    key={field.name}
                    field={field}
                    viewerRoles={viewerRoles}
                    renderField={renderField}
                    value={values[field.name]}
                    error={errors?.[field.name]}
                    onChange={(v) => setField(field.name, v)}
                />
            ))}
        </div>
    );
}

function FieldControl({
    field,
    viewerRoles,
    renderField,
    value,
    error,
    onChange,
}: {
    field: FieldDefinition;
    viewerRoles: readonly string[];
    renderField?: (props: FieldRenderProps) => ReactNode | null;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
}) {
    const label = (
        <Label htmlFor={field.name}>
            {field.displayName}
            {field.isRequired && <span className="text-destructive ml-0.5">*</span>}
        </Label>
    );

    // A definition can name a type by one of the registry's aliases, and the control has to follow
    // the type it aliases: 'integer' is a number box, not the textarea the default would give it.
    // Undefined means the API knows a type this package does not, which is a different case from
    // `string` and gets the roomier control at the bottom of the switch.
    const type = resolveFieldType(field.type);

    if (!fieldIsVisibleTo(field, viewerRoles)) {
        return <MaskedField field={field} label={label} value={value} />;
    }

    const host = renderField?.({ field, type, label, value, error, onChange });
    if (host) return host;

    switch (type) {
        case 'bool':
            return (
                <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
                    {label}
                    <Switch id={field.name} checked={Boolean(value)} onCheckedChange={onChange} />
                </div>
            );

        case 'int':
        case 'decimal':
        case 'money':
            return (
                <div className="space-y-2">
                    {label}
                    <Input
                        id={field.name}
                        type="number"
                        step={type === 'int' ? 1 : 'any'}
                        inputMode={type === 'int' ? 'numeric' : 'decimal'}
                        value={value === null || value === undefined ? '' : String(value)}
                        onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') return onChange(null);
                            onChange(type === 'int' ? parseInt(raw, 10) : parseFloat(raw));
                        }}
                        className="w-fit"
                    />
                    <FieldError message={error} />
                </div>
            );

        // Native pickers for the temporal types.
        case 'date':
        case 'datetime':
        case 'time':
            return (
                <div className="space-y-2">
                    {label}
                    <Input
                        id={field.name}
                        type={type === 'datetime' ? 'datetime-local' : type}
                        value={(value as string) || ''}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-fit"
                    />
                    <FieldError message={error} />
                </div>
            );

        // Single-line inputs. email/url get the matching native keyboard and hint; format is
        // enforced server-side by FieldTypeRegistry. A reference only reaches here when its
        // definition names no target type, and then it reads like a uuid; that the target exists is
        // checked on write.
        case 'email':
        case 'url':
        case 'slug':
        case 'uuid':
        case 'reference':
            return (
                <div className="space-y-2">
                    {label}
                    <Input
                        id={field.name}
                        type={type === 'email' ? 'email' : type === 'url' ? 'url' : 'text'}
                        inputMode={type === 'email' ? 'email' : type === 'url' ? 'url' : 'text'}
                        placeholder={PLACEHOLDERS[type]}
                        value={(value as string) || ''}
                        onChange={(e) => onChange(e.target.value)}
                        className={type === 'email' || type === 'url' ? undefined : 'font-mono'}
                    />
                    <FieldError message={error} />
                </div>
            );

        // A geopoint is an object the server pins to { "lat": number, "lng": number }, so it
        // belongs here rather than in a text box that would store the shape as a string.
        case 'json':
        case 'array':
        case 'object':
        case 'geopoint':
            return (
                <JsonField
                    field={field}
                    type={type}
                    label={label}
                    value={value}
                    error={error}
                    onChange={onChange}
                />
            );

        // One line, because that is what the type means. A string that wants paragraphs is a
        // `text` or a `markdown` field, and the designer says so.
        case 'string':
            return (
                <div className="space-y-2">
                    {label}
                    <Input
                        id={field.name}
                        type="text"
                        value={(value as string) || ''}
                        onChange={(e) => onChange(e.target.value)}
                    />
                    <FieldError message={error} />
                </div>
            );

        // markdown and richtext land here when the host draws no editor of its own, and so does a
        // type this package has never heard of: a console can be older than its API, and a field it
        // cannot name is still editable. The value is text either way, so a textarea is never the
        // wrong store, only the plainer one.
        case 'text':
        case 'markdown':
        case 'richtext':
        default:
            return (
                <div className="space-y-2">
                    {label}
                    <Textarea
                        id={field.name}
                        rows={6}
                        value={(value as string) || ''}
                        onChange={(e) => onChange(e.target.value)}
                    />
                    <FieldError message={error} />
                </div>
            );
    }
}

/**
 * A field the viewer's roles cannot read.
 *
 * Read only rather than absent: the entry has a field there, and leaving it off the form makes the
 * screen look like the definition is shorter than it is. Read only rather than disabled, so it
 * still takes focus and a screen reader still reaches the explanation under it.
 */
function MaskedField({
    field,
    label,
    value,
}: {
    field: FieldDefinition;
    label: ReactNode;
    value: unknown;
}) {
    const shown = value === null || value === undefined ? '' : String(value);
    return (
        <div className="space-y-2">
            {label}
            <Input
                id={field.name}
                type="text"
                readOnly
                value={shown}
                aria-describedby={`${field.name}-masked`}
                className="text-muted-foreground font-mono"
            />
            <p id={`${field.name}-masked`} className="text-muted-foreground text-xs">
                {maskedNotice(field)}
            </p>
        </div>
    );
}

const PLACEHOLDERS: Partial<Record<FieldType, string>> = {
    email: 'name@example.com',
    url: 'https://example.com',
    slug: 'my-post-title',
    uuid: '00000000-0000-0000-0000-000000000000',
    reference: '00000000-0000-0000-0000-000000000000',
};

const JSON_HINTS: Partial<Record<FieldType, string>> = {
    array: 'JSON list, e.g. ["one", "two"]',
    geopoint: 'A position, e.g. {"lat": 14.5995, "lng": 120.9842}',
};

export function JsonField({
    field,
    type,
    label,
    value,
    error,
    onChange,
}: {
    field: FieldDefinition;
    type: FieldType;
    label: ReactNode;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
}) {
    const [text, setText] = useState(() =>
        value === undefined || value === null
            ? type === 'array'
                ? '[]'
                : '{}'
            : JSON.stringify(value, null, 2)
    );
    const [parseError, setParseError] = useState<string | null>(null);

    return (
        <div className="space-y-2">
            {label}
            <Textarea
                id={field.name}
                rows={4}
                spellCheck={false}
                value={text}
                onChange={(e) => {
                    setText(e.target.value);
                    try {
                        const parsed = JSON.parse(e.target.value);
                        setParseError(null);
                        onChange(parsed);
                    } catch {
                        setParseError(
                            'Not valid JSON yet. The field keeps its last valid value until this parses.'
                        );
                    }
                }}
                className={cn('font-mono text-xs', parseError && 'border-warning')}
            />
            <p className="text-muted-foreground text-xs">
                {JSON_HINTS[type] ?? 'JSON object, e.g. {"key": "value"}'}
            </p>
            <FieldError message={parseError ?? error} />
        </div>
    );
}
