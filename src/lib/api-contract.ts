/**
 * Whether the API on the other end is one this console can drive.
 *
 * The console and the API release separately, so a mismatch is a normal deployment mistake rather
 * than a rare one. Left unchecked it surfaces as whatever breaks first: a list that renders empty,
 * a save that 400s, a field quietly missing. That is a support ticket with no useful first sentence.
 *
 * barakoCMS exposes `X-Api-Contract-Version`, a number separate from its package version that moves
 * only when the HTTP surface changes in a way that breaks a consumer. Comparing package versions
 * instead would mean refusing every patch release, or hand-maintaining a table that drifts.
 *
 * Two properties of that header decide the whole design here:
 *
 *   - It is on **every** response, including 401 and 405. So the check needs no request of its own,
 *     and it works before anyone has signed in.
 *   - It is on a response header rather than in one body. So a rolling upgrade that changes the
 *     answer halfway through a session is noticed, rather than being missed by a check that ran
 *     once at startup.
 */

/** The header barakoCMS sends. Axios lowercases header names on the way in. */
export const CONTRACT_HEADER = 'x-api-contract-version';

/**
 * The contract versions this build speaks, inclusive.
 *
 * One place, so widening it is one edit. It is a range rather than a list of barakoCMS releases on
 * purpose: the console supports a contract, and which releases carry that contract is a question
 * for humans reading CHANGELOG.md, which states the API range every console release works against.
 *
 * Both ends are live, not one end with history behind it. A rolling upgrade of the API answers with
 * the old version and the new one at the same time, so a console that dropped the lower end would
 * refuse half the responses for the length of the rollout.
 *
 * Typed as numbers rather than left `as const`. Under `as const` the ends are the literal types 1 and
 * 2, and the screen that renders the range compares them to decide whether to print one number or
 * two, which the compiler then reads as a comparison that can never be true (TS2367). These are the
 * ends of a range that moves, not two constants.
 */
export const SUPPORTED_CONTRACT: { readonly min: number; readonly max: number } = { min: 1, max: 2 };

export type ContractState =
    /** Nothing seen yet. No request has come back, so there is nothing to judge. */
    | { kind: 'unknown' }
    | { kind: 'ok'; version: number }
    /** The API is behind this console. The user upgraded the console and not the API. */
    | { kind: 'api-older'; version: number }
    /** The API is ahead of this console. The other direction of the same mistake. */
    | { kind: 'api-newer'; version: number }
    /**
     * The API sent no contract version at all. Not an error: it is the signal that this API
     * predates the contract version entirely, so it is definitely too old.
     */
    | { kind: 'absent' };

/** Reads a header value into a state. Anything unparseable is treated as absent, not as a fault. */
export function classifyContract(headerValue: string | null | undefined): ContractState {
    if (headerValue === null || headerValue === undefined || String(headerValue).trim() === '') {
        return { kind: 'absent' };
    }

    const version = Number(String(headerValue).trim());
    if (!Number.isInteger(version)) return { kind: 'absent' };

    if (version < SUPPORTED_CONTRACT.min) return { kind: 'api-older', version };
    if (version > SUPPORTED_CONTRACT.max) return { kind: 'api-newer', version };
    return { kind: 'ok', version };
}

/** The states that stop the console. Extracted so a caller can only read a version that exists. */
export type IncompatibleContract = Extract<
    ContractState,
    { kind: 'api-older' | 'api-newer' | 'absent' }
>;

/**
 * Whether this state should stop the console rather than let it half-work.
 *
 * A type predicate rather than a boolean, so the screen that renders the mismatch cannot reach for
 * a version on a state that has none. `unknown` is compatible on purpose: nothing has answered yet,
 * and accusing an API of a mismatch before it has spoken would block every cold start.
 */
export function isIncompatible(state: ContractState): state is IncompatibleContract {
    return state.kind === 'api-older' || state.kind === 'api-newer' || state.kind === 'absent';
}

let current: ContractState = { kind: 'unknown' };
const listeners = new Set<() => void>();

/**
 * Records what the last response said.
 *
 * A response carrying no header does not overwrite a version already seen. Every response from
 * this API carries one, so a bare response is far more likely to be something in between (a proxy
 * stripping headers, a cached or synthetic response) than the API having become older mid-session.
 * Treating it as `absent` would take a working console down on one odd response.
 *
 * When nothing has been seen at all, a bare response is exactly the signal `absent` is for: an API
 * old enough to predate the contract version. That case still stops the console.
 *
 * Never goes back to `unknown`. The only way back is a reset, which exists for tests.
 */
export function recordContractVersion(headerValue: string | null | undefined) {
    const next = classifyContract(headerValue);
    if (next.kind === 'absent' && current.kind !== 'unknown' && current.kind !== 'absent') return;
    if (next.kind === current.kind && (next as { version?: number }).version === (current as { version?: number }).version) {
        return;
    }
    current = next;
    listeners.forEach((l) => l());
}

export function getContractState(): ContractState {
    return current;
}

/** Server snapshot for useSyncExternalStore: nothing has been seen during SSR, by definition. */
export function getContractServerState(): ContractState {
    return SERVER_UNKNOWN;
}

// A stable object, because useSyncExternalStore compares snapshots by identity and a fresh literal
// each call is an infinite render loop.
const SERVER_UNKNOWN: ContractState = { kind: 'unknown' };

export function subscribeToContract(callback: () => void) {
    listeners.add(callback);
    return () => {
        listeners.delete(callback);
    };
}

/** Test hook: forget what has been seen. */
export function __resetContractForTests() {
    current = { kind: 'unknown' };
    listeners.clear();
}
