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
    isSingleton?: boolean;
}
