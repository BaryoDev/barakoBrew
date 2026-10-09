import type { FieldDefinition, StateTransition } from '@/types/schema';

/** A field a transition asks for, and whether the move needs it. */
export interface TransitionField {
    field: FieldDefinition;
    required: boolean;
}

/**
 * The fields a transition asks for, in the type's own field order. Names are matched without regard
 * to case, as the API matches them; a name the type does not have is skipped, since the API would
 * not have accepted the definition with it.
 */
export function transitionFields(
    transition: StateTransition,
    fields: readonly FieldDefinition[],
): TransitionField[] {
    const required = new Set((transition.requiredFields ?? []).map((n) => n.toLowerCase()));
    const optional = new Set((transition.optionalFields ?? []).map((n) => n.toLowerCase()));
    return fields
        .filter((f) => required.has(f.name.toLowerCase()) || optional.has(f.name.toLowerCase()))
        .map((f) => ({ field: f, required: required.has(f.name.toLowerCase()) }));
}

/** Whether a value counts as given. Empty text, an empty list and null do not. */
export function hasValue(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

/** The required fields still without a value. */
export function missingTransitionFields(
    asked: readonly TransitionField[],
    values: Record<string, unknown>,
): FieldDefinition[] {
    return asked.filter((a) => a.required && !hasValue(values[a.field.name])).map((a) => a.field);
}

/**
 * The transition a link names (`?transition=Approve`, which `{{links.transition "Approve"}}` builds
 * in a barakoCMS 4.8 email), or null when the type declares none by that name. Matched without
 * regard to case, as the API matches a transition name.
 */
export function requestedTransition(
    transitions: readonly StateTransition[],
    name: string | null | undefined,
): StateTransition | null {
    const wanted = name?.trim().toLowerCase();
    if (!wanted) return null;
    return transitions.find((t) => t.name.toLowerCase() === wanted) ?? null;
}
