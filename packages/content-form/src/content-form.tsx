'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { Input, Label, Switch, Textarea, FieldError, cn } from './ui';
import { fieldIsVisibleTo, maskedNotice, type Viewer } from './sensitivity';
import { resolveFieldType, type FieldDefinition, type FieldType } from './definition';
import { groupBySection, moneyScale, stepFor } from './presentation';

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
     * The viewer's capabilities in the current tenant, when the host knows them. With them a
     * Sensitive or Hidden field is decided the way API 4.6 decides it, by `view_sensitive` and
     * `view_hidden`; without them, by role name as an older API did.
     */
    viewerCapabilities?: readonly string[];
    /** The viewer's role ids, which is how the seeded SuperAdmin role is recognised. */
    viewerRoleIds?: readonly string[];
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
 * The key an entry holds a field's value under.
 *
 * The API finds a field by its name ignoring case, so an entry can hold `title` for a field named
 * `Title`. The field's own spelling wins when it is stored, then a stored key that differs only in
 * case, then the field's name for a value not stored yet. Reading and writing through this keeps one
 * spelling per field: API 4.7 refuses a save that sends two.
 */
export function fieldValueKey(values: Record<string, unknown>, name: string): string {
    if (Object.hasOwn(values, name)) return name;
    const lower = name.toLowerCase();
    return Object.keys(values).find((key) => key.toLowerCase() === lower) ?? name;
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
    viewerCapabilities,
    viewerRoleIds,
    renderField,
    emptyMessage,
}: ContentFormProps) {
    const viewer: Viewer = { roles: viewerRoles, roleIds: viewerRoleIds, capabilities: viewerCapabilities };
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

    const control = (field: FieldDefinition) => {
        const key = fieldValueKey(values, field.name);
        return (
            <FieldControl
                key={field.name}
                field={field}
                viewer={viewer}
                renderField={renderField}
                value={values[key]}
                error={errors?.[field.name]}
                onChange={(v) => setField(key, v)}
            />
        );
    };

    // A field's section groups it under a heading. Fields in no section are drawn as they always
    // were, so a type that names no section looks exactly as it did.
    return (
        <div className="space-y-5">
            {groupBySection(fields).map((group) =>
                group.section === null ? (
                    <Fragment key="section:none">{group.fields.map(control)}</Fragment>
                ) : (
                    <fieldset key={`section:${group.section}`} className="space-y-5 rounded-lg border p-4">
                        <legend className="px-1 text-sm font-medium">{group.section}</legend>
                        {group.fields.map(control)}
                    </fieldset>
                )
            )}
        </div>
    );
}

function FieldControl({
    field,
    viewer,
    renderField,
    value,
    error,
    onChange,
}: {
    field: FieldDefinition;
    viewer: Viewer;
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

    if (!fieldIsVisibleTo(field, viewer)) {
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

        // A money field with a currency holds amounts to that currency's decimal places. The value
        // stays a plain JSON number either way; the code is on the definition, not in the entry.
        case 'money': {
            const scale = moneyScale(field);
            if (scale === undefined) break;
            const currency = field.currency as string;
            return (
                <div className="space-y-2">
                    {label}
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono text-sm" aria-hidden="true">
                            {currency}
                        </span>
                        <Input
                            id={field.name}
                            type="number"
                            step={stepFor(scale)}
                            inputMode="decimal"
                            aria-describedby={`${field.name}-currency`}
                            value={value === null || value === undefined ? '' : String(value)}
                            onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') return onChange(null);
                                onChange(parseFloat(raw));
                            }}
                            className="w-fit"
                        />
                    </div>
                    <p id={`${field.name}-currency`} className="text-muted-foreground text-xs">
                        {scale === 0
                            ? `An amount in ${currency}, in whole units.`
                            : `An amount in ${currency}, up to ${scale} decimal ${scale === 1 ? 'place' : 'places'}.`}
                    </p>
                    <FieldError message={error} />
                </div>
            );
        }

        // The server generates a token when the entry is created and discards any value sent for
        // one, so it is shown and never edited. A reader who may not see it never gets here.
        case 'token':
            return (
                <div className="space-y-2">
                    {label}
                    <Input
                        id={field.name}
                        type="text"
                        readOnly
                        value={typeof value === 'string' ? value : ''}
                        placeholder="Generated when the entry is saved"
                        aria-describedby={`${field.name}-token`}
                        className="text-muted-foreground font-mono"
                    />
                    <p id={`${field.name}-token`} className="text-muted-foreground text-xs">
                        Generated by the server. It cannot be changed.
                    </p>
                </div>
            );
    }

    switch (type) {
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
        case 'file':
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
        case 'inlineimage':
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
    file: '00000000-0000-0000-0000-000000000000',
};

const JSON_HINTS: Partial<Record<FieldType, string>> = {
    array: 'JSON list, e.g. ["one", "two"]',
    geopoint: 'A position, e.g. {"lat": 14.5995, "lng": 120.9842}',
    inlineimage: 'An image as {"url": "data:image/png;base64,...", "alt": "..."}, up to 64 KB',
};

/** A value as the JSON an editor types, with an empty list or object for one that is not there. */
function asText(value: unknown, type: FieldType): string {
    if (value === undefined || value === null) return type === 'array' ? '[]' : '{}';
    return JSON.stringify(value, null, 2);
}

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
    const [text, setText] = useState(() => asText(value, type));
    const [parseError, setParseError] = useState<string | null>(null);

    /**
     * The value this editor last handed out, which is how it tells its own edit from somebody
     * else's.
     *
     * The text is held here rather than derived, so half-typed JSON survives a re-render. That is
     * right while the editor is the one changing the value and wrong the moment anything else does:
     * the form keys a field by its name, so this control stays mounted when the entry is reloaded
     * on a save conflict, rolled back to an earlier version, or when the create screen is pointed
     * at a different content type. It kept showing the old JSON, and the next keystroke wrote that
     * over the value that had just arrived.
     */
    const [handedOut, setHandedOut] = useState(value);

    if (!Object.is(value, handedOut)) {
        setHandedOut(value);
        setText(asText(value, type));
        setParseError(null);
    }

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
                        setHandedOut(parsed);
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
