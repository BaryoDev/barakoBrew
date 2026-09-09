// Types for Content Type Schema management.
// Field types mirror the backend's enforced set (Core/Validation/FieldTypeRegistry.cs —
// the single source of truth every backend validator reads from).

import { SensitivityLevel } from './content';

export { SensitivityLevel };

export interface FieldDefinition {
    name: string; // PascalCase enforced by the backend
    displayName: string;
    type: FieldType;
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
    | 'richtext'
    | 'markdown'
    | 'json'
    | 'array'
    | 'object';

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

export const FIELD_TYPES: { value: FieldType; label: string; description: string }[] = [
    // Text
    { value: 'string', label: 'Text', description: 'A line or block of text' },
    { value: 'richtext', label: 'Rich text', description: 'Formatted content (HTML)' },
    { value: 'markdown', label: 'Markdown', description: 'Markdown-formatted text' },
    // Numbers
    { value: 'int', label: 'Whole number', description: 'Counts and quantities' },
    { value: 'decimal', label: 'Decimal number', description: 'Ratings, measurements' },
    { value: 'money', label: 'Money', description: 'A monetary amount' },
    // Boolean
    { value: 'bool', label: 'Yes / No', description: 'A true-or-false toggle' },
    // Date & time
    { value: 'date', label: 'Date', description: 'A calendar date' },
    { value: 'datetime', label: 'Date & time', description: 'A point in time' },
    { value: 'time', label: 'Time', description: 'A time of day' },
    // Validated formats
    { value: 'email', label: 'Email', description: 'A valid email address' },
    { value: 'url', label: 'URL', description: 'A web link (http/https)' },
    { value: 'slug', label: 'Slug', description: 'URL-friendly identifier, e.g. my-post' },
    { value: 'uuid', label: 'UUID', description: 'A unique identifier' },
    // Structured
    { value: 'json', label: 'JSON', description: 'An arbitrary JSON object or array' },
    { value: 'array', label: 'List', description: 'Multiple values in one field' },
    { value: 'object', label: 'Nested object', description: 'Structured JSON data' },
];
