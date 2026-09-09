// Types for Content Type Schema management.
// Field types mirror the backend's enforced set (Core/Validation/FieldTypeRegistry.cs —
// the single source of truth every backend validator reads from).

import { SensitivityLevel } from './content';

export { SensitivityLevel };

export interface FieldDefinition {
    name: string; // PascalCase enforced by the backend
    displayName: string;
    // The wire carries whatever spelling the definition was written with, alias included, so this
    // is wider than what the picker offers. Put it through resolveFieldType before switching on it.
    type: FieldType | FieldTypeAlias;
    isRequired: boolean;
    defaultValue?: unknown;
    validationRules?: Record<string, unknown>;
    // Field-level sensitivity. When not Public, the field is masked for readers who are not
    // SuperAdmin and not in visibleToRoles (falling back to a default policy when empty).
    sensitivity?: SensitivityLevel;
    visibleToRoles?: string[];
    mask?: FieldMask;
}

/**
 * Mirrors barakoCMS `Models.FieldMask`, which crosses the wire as a **name**, not a number.
 *
 * This was `Default = 0 … Last4 = 3` with a comment saying the API serialised numbers. It does not:
 * its OpenAPI document publishes `["Default", "Remove", "Redact", "Last4"]` as a string enum, and a
 * mask read back from `GET /api/content-types` arrives as `"Redact"`. The write path hid it, because
 * the server accepts a number as well and stores the name either way, so creating a type looked
 * correct. Reading one back did not: the editor compared `2` against `"Redact"`, matched nothing,
 * and showed no mask for a field that has one.
 *
 * Found by `smoke/enums.spec.ts` on its first run, which is the same shape as the bug that gate
 * exists for. `ContentStatus` was numeric on both sides too, until it was not.
 */
export enum FieldMask {
    Default = 'Default', // Remove for Hidden, Redact for Sensitive
    Remove = 'Remove', // drop the field
    Redact = 'Redact', // replace with ***
    Last4 = 'Last4', // keep only the last 4 characters
}

export const FIELD_MASKS: { value: FieldMask; label: string }[] = [
    { value: FieldMask.Default, label: 'Default (remove if Hidden, *** if Sensitive)' },
    { value: FieldMask.Remove, label: 'Remove the field entirely' },
    { value: FieldMask.Redact, label: 'Redact to ***' },
    { value: FieldMask.Last4, label: 'Show last 4 only' },
];

export type FieldType =
    | 'string'
    | 'text'
    | 'int'
    | 'decimal'
    | 'money'
    | 'bool'
    | 'date'
    | 'datetime'
    | 'time'
    | 'email'
    | 'url'
    | 'slug'
    | 'uuid'
    | 'reference'
    | 'richtext'
    | 'markdown'
    | 'json'
    | 'array'
    | 'object'
    | 'geopoint';

/** Historical spellings the registry still accepts. Never offered as a type of its own. */
export type FieldTypeAlias = 'integer' | 'number' | 'boolean';

export const FIELD_TYPE_ALIASES: Record<FieldTypeAlias, FieldType> = {
    integer: 'int',
    number: 'int',
    boolean: 'bool',
};

export interface ContentTypeDefinition {
    id?: string;
    name: string;
    displayName: string;
    description?: string;
    fields: FieldDefinition[];
    /** Served anonymously at /api/public/{name}. Off unless someone turns it on. */
    isPubliclyDeliverable?: boolean;
    /** This type's own lifecycle, or absent for Draft, Published and Archived. */
    lifecycle?: LifecycleDefinition | null;
    createdAt?: string;
    updatedAt?: string;
}

/** A type's own states and the named moves between them. Mirrors Models/ContentTypeDefinition.cs. */
export interface StateTransition {
    name: string;
    from: string;
    to: string;
}

export interface LifecycleDefinition {
    states: string[];
    initialState: string;
    transitions: StateTransition[];
}

export interface CreateSchemaRequest {
    name: string;
    displayName: string;
    description?: string;
    fields: FieldDefinition[];
    isPubliclyDeliverable?: boolean;
}

/**
 * Every field type the API accepts, grouped the way the Add-a-field panel groups them.
 *
 * The source of truth is the server's Core/Validation/FieldTypeRegistry.cs, and this is a copy of
 * it kept by hand. It has to be: the registry is a static C# array, and the API publishes it
 * neither as an endpoint nor as an enum in its OpenAPI document, so nothing here can be checked
 * against the server the way smoke/enums.spec.ts checks the enums that are published. A type added
 * there has to be added here, and src/types/schema.test.ts pins this list by name so the copy fails
 * loudly rather than quietly offering nineteen of twenty.
 */
export const FIELD_TYPE_GROUPS: {
    label: string;
    types: { value: FieldType; label: string; description: string }[];
}[] = [
    {
        label: 'Text',
        types: [
            { value: 'string', label: 'Text', description: 'A single line of text' },
            { value: 'text', label: 'Long text', description: 'A block of plain text' },
            { value: 'richtext', label: 'Rich text', description: 'Formatted content (HTML)' },
            { value: 'markdown', label: 'Markdown', description: 'Markdown-formatted text' },
            { value: 'slug', label: 'Slug', description: 'URL-friendly identifier, e.g. my-post' },
            { value: 'uuid', label: 'UUID', description: 'A unique identifier' },
        ],
    },
    {
        label: 'Numbers',
        types: [
            { value: 'int', label: 'Whole number', description: 'Counts and quantities' },
            { value: 'decimal', label: 'Decimal number', description: 'Ratings, measurements' },
            { value: 'money', label: 'Money', description: 'A monetary amount' },
        ],
    },
    {
        label: 'Time',
        types: [
            { value: 'date', label: 'Date', description: 'A calendar date' },
            { value: 'datetime', label: 'Date & time', description: 'A point in time' },
            { value: 'time', label: 'Time', description: 'A time of day' },
        ],
    },
    {
        label: 'True or false',
        types: [{ value: 'bool', label: 'Yes / No', description: 'A true-or-false toggle' }],
    },
    {
        label: 'Structured',
        types: [
            { value: 'array', label: 'List', description: 'Multiple values in one field' },
            { value: 'object', label: 'Nested object', description: 'Structured JSON data' },
            { value: 'json', label: 'JSON', description: 'An arbitrary JSON object or array' },
            { value: 'geopoint', label: 'Location', description: 'A latitude and longitude pair' },
        ],
    },
    {
        // The server checks the format of these on write and rejects a value that does not fit.
        label: 'Checked on write',
        types: [
            { value: 'email', label: 'Email', description: 'A valid email address' },
            { value: 'url', label: 'URL', description: 'A web link (http/https)' },
            { value: 'reference', label: 'Reference', description: 'The id of another entry' },
        ],
    },
];

/** The same types, flat, for looking one up by value. */
export const FIELD_TYPES: { value: FieldType; label: string; description: string }[] =
    FIELD_TYPE_GROUPS.flatMap((group) => group.types);

const BY_VALUE = new Map(FIELD_TYPES.map((type) => [type.value, type]));

/**
 * The canonical type behind a name the API sent, or undefined if this console does not know it.
 *
 * Case-insensitive, because the registry lookup is: the server accepts 'Integer' and stores the
 * spelling it was handed. Undefined rather than a fallback to string, so a caller can tell a type
 * it cannot render from one it can.
 */
export function resolveFieldType(type: string): FieldType | undefined {
    const key = type.toLowerCase();
    if (BY_VALUE.has(key as FieldType)) return key as FieldType;
    return FIELD_TYPE_ALIASES[key as FieldTypeAlias];
}

/** What to call a field type on screen. One this console does not know shows as the server sent it. */
export function fieldTypeLabel(type: string): string {
    const resolved = resolveFieldType(type);
    return resolved ? BY_VALUE.get(resolved)!.label : type;
}
