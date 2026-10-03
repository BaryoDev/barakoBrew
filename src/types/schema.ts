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
     * Holds exactly one entry, so the console shows one edit screen for it rather than a list. The
     * API refuses a second create. Absent from an API older than the flag, which reads as false.
     */
    isSingleton?: boolean;
    /** Where an entry lives on the site, such as `/blog/{slug}`. Absent or null when none is declared. */
    routeTemplate?: string | null;
    /** Values only one entry of this type may hold at a time. Absent or null when there are none. */
    uniqueness?: UniquenessRule[] | null;
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

/** The name that stands for the entry's creator in a uniqueness rule. */
export const CREATED_BY_FIELD = '$createdBy';

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
    isSingleton?: boolean;
    /** Left out when empty, so an API older than the member is sent nothing it does not know. */
    routeTemplate?: string;
}
