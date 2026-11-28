// Types for Content Type Schema management.
//
// The field vocabulary itself (field types, their aliases, a field definition, sensitivity and
// masking) moved to barako-content-form, because the renderer, the designer and BaryoDev/barakoCMS#345's
// CLI all have to agree on what a valid definition looks like. It is re-exported here so every
// screen keeps importing it from the place it always has.

export {
    FieldMask,
    SensitivityLevel,
    FIELD_TYPE_ALIASES,
    FIELD_TYPE_GROUPS,
    FIELD_TYPES,
    fieldTypeLabel,
    resolveFieldType,
} from 'barako-content-form';
export type {
    FieldDefinition,
    FieldOption,
    FieldType,
    FieldTypeAlias,
} from 'barako-content-form';

import { FieldMask, type FieldDefinition } from 'barako-content-form';

/** The masks the field designer offers, in the order it offers them. */
export const FIELD_MASKS: { value: FieldMask; label: string }[] = [
    { value: FieldMask.Default, label: 'Default (remove if Hidden, *** if Sensitive)' },
    { value: FieldMask.Remove, label: 'Remove the field entirely' },
    { value: FieldMask.Redact, label: 'Redact to ***' },
    { value: FieldMask.Last4, label: 'Show last 4 only' },
];

/**
 * The icon a type is drawn with: a sprite glyph by `name`, or custom markup in `svg`, never both.
 * The API sanitises `svg` on write; the console still draws it only through a registered symbol.
 */
export interface ContentTypeIcon {
    name?: string | null;
    svg?: string | null;
}

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
    /**
     * The stored version, sent as If-Match when the lifecycle is edited. Null for a type an account
     * owns, absent from a core older than 5.9.0. Either way the lifecycle cannot be edited here.
     */
    version?: string | null;
    /**
     * Holds exactly one entry, so the console shows one edit screen for it rather than a list. The
     * API refuses a second create. Absent from an API older than the flag, which reads as false.
     */
    isSingleton?: boolean;
    /** The entry stream is this type's source of truth, so its fields have to stay Public. Absent before the API sent it. */
    eventSourced?: boolean;
    /** The icon this type is drawn with. Absent or null when it has none. */
    icon?: ContentTypeIcon | null;
    /** Where an entry lives on the site, such as `/blog/{slug}`. Absent or null when none is declared. */
    routeTemplate?: string | null;
    /** Values only one entry of this type may hold at a time. Absent or null when there are none. */
    uniqueness?: UniquenessRule[] | null;
    /** The type whose entries are this type's lines. Absent or null when this type has none. */
    lines?: LinesDefinition | null;
    createdAt?: string;
    updatedAt?: string;
}

/** A type's own states and the named moves between them. Mirrors Models/ContentTypeDefinition.cs. */
export interface StateTransition {
    name: string;
    from: string;
    to: string;
    /** Fields whose values have to be sent with this move. Absent from an API older than 4.6. */
    requiredFields?: string[];
    /** Fields whose values may be sent with this move. */
    optionalFields?: string[];
}

/** Mirrors Models/ContentTypeDefinition.cs UniquenessRule. */
export interface UniquenessRule {
    name: string;
    /** One to five field names, or `$createdBy` for the user who created the entry. */
    fields: string[];
    /** The lifecycle state an entry has to be in to count, or null to count every entry. */
    whenState?: string | null;
}

/**
 * Another type whose entries point back at this one, as the lines of an order point at the order.
 * Mirrors Models/ContentTypeDefinition.cs LinesDefinition.
 */
export interface LinesDefinition {
    /** The line type's stored name. Match it against the type list without regard to case. */
    contentType: string;
    /** The line type's single reference field that holds the header's id. */
    parentField: string;
    /** The header's number field that has to equal the lines' sum. Set together with `lineAmountField`. */
    totalField?: string | null;
    /** The line type's number field that is added up. Set together with `totalField`. */
    lineAmountField?: string | null;
}

/** The name that stands for the entry's creator in a uniqueness rule. */
export const CREATED_BY_FIELD = '$createdBy';

export interface LifecycleDefinition {
    states: string[];
    initialState: string;
    transitions: StateTransition[];
}

/** One thing a lifecycle edit would break (a blocker) or leave dangling (a warning). */
export interface LifecycleBlocker {
    kind: string;
    state?: string | null;
    transition?: string | null;
    name?: string | null;
    count?: number | null;
    message: string;
}

/** The 200 answer of PUT /api/content-types/{name}/lifecycle, for a dry run and for a save. */
export interface SetLifecycleResult {
    name: string;
    version: string;
    lifecycle: LifecycleDefinition;
    dryRun: boolean;
    changed: boolean;
    canApply: boolean;
    blockers: LifecycleBlocker[];
    warnings: LifecycleBlocker[];
}

export interface CreateSchemaRequest {
    name: string;
    displayName: string;
    description?: string;
    fields: FieldDefinition[];
    isPubliclyDeliverable?: boolean;
    isSingleton?: boolean;
    /** Left out when empty, so an API older than the member is sent nothing it does not know. */
    routeTemplate?: string;
    /** Left out when the type has none, so it keeps Draft, Published and Archived. */
    lifecycle?: LifecycleDefinition;
}
