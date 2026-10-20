import type { LifecycleDefinition } from '@/types/schema';

// The rules below are the API's own (ContentTypeValidatorService.ValidateLifecycle), so a lifecycle
// the console accepts is one the API accepts. Names compare case-insensitively, as there.

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

export function isPascalCase(name: string): boolean {
    return PASCAL_CASE.test(name);
}

function same(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}

function hasState(states: string[], name: string): boolean {
    return states.some((s) => same(s, name));
}

/** An empty lifecycle: no states and no transitions. Sending it means "no lifecycle". */
export function isEmptyLifecycle(lifecycle: LifecycleDefinition): boolean {
    return lifecycle.states.length === 0 && lifecycle.transitions.length === 0;
}

/** Everything the API would refuse about this lifecycle, as sentences. Empty means it is valid. */
export function lifecycleProblems(lifecycle: LifecycleDefinition): string[] {
    if (isEmptyLifecycle(lifecycle)) return [];
    const problems: string[] = [];
    const { states, initialState, transitions } = lifecycle;

    if (states.length === 0) problems.push('A lifecycle must declare at least one state.');

    const seenStates = new Set<string>();
    for (const state of states) {
        const key = state.toLowerCase();
        if (seenStates.has(key)) problems.push(`State '${state}' is declared more than once.`);
        seenStates.add(key);
        if (!isPascalCase(state)) {
            problems.push(`State '${state}' must be in PascalCase, letters and digits only.`);
        }
    }

    if (!initialState.trim()) {
        problems.push('A lifecycle must name the state a new entry starts in.');
    } else if (!hasState(states, initialState)) {
        problems.push(`The initial state '${initialState}' is not one of the declared states.`);
    }

    const seenNames = new Set<string>();
    for (const t of transitions) {
        if (!t.name.trim()) {
            problems.push('Every transition needs a name, because a permission and a workflow both key on it.');
            continue;
        }
        const key = t.name.toLowerCase();
        if (seenNames.has(key)) problems.push(`Transition '${t.name}' is declared more than once.`);
        seenNames.add(key);
        if (!isPascalCase(t.name)) {
            problems.push(`Transition '${t.name}' must be in PascalCase, letters and digits only.`);
        }
        if (!hasState(states, t.from)) {
            problems.push(`Transition '${t.name}' moves from '${t.from}', which is not a declared state.`);
        }
        if (!hasState(states, t.to)) {
            problems.push(`Transition '${t.name}' moves to '${t.to}', which is not a declared state.`);
        }
        if (same(t.from, t.to) && t.from) {
            problems.push(`Transition '${t.name}' moves '${t.from}' to itself, which changes nothing.`);
        }
    }

    return problems;
}

/** The transitions that name a state, as their names. */
export function transitionsUsing(lifecycle: LifecycleDefinition, state: string): string[] {
    return lifecycle.transitions
        .filter((t) => same(t.from, state) || same(t.to, state))
        .map((t) => t.name || `${t.from} to ${t.to}`);
}

/**
 * What to put in a request: null when the lifecycle is empty (the type keeps Draft, Published and
 * Archived), otherwise exactly the states, initial state and named moves. Fields a transition asks
 * for are kept when it has them.
 */
export function lifecycleToSend(lifecycle: LifecycleDefinition): LifecycleDefinition | null {
    if (isEmptyLifecycle(lifecycle)) return null;
    return {
        states: lifecycle.states,
        initialState: lifecycle.initialState,
        transitions: lifecycle.transitions.map((t) => ({
            name: t.name,
            from: t.from,
            to: t.to,
            ...(t.requiredFields ? { requiredFields: t.requiredFields } : {}),
            ...(t.optionalFields ? { optionalFields: t.optionalFields } : {}),
        })),
    };
}

export const EMPTY_LIFECYCLE: LifecycleDefinition = { states: [], initialState: '', transitions: [] };
