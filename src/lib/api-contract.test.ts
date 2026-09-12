import { describe, it, expect, beforeEach } from 'vitest';
import {
    classifyContract,
    isIncompatible,
    recordContractVersion,
    getContractState,
    subscribeToContract,
    __resetContractForTests,
    SUPPORTED_CONTRACT,
} from './api-contract';

/**
 * The three cases the console has to tell apart, plus the one it must not confuse with them.
 *
 * "The API sent nothing" is the case worth naming: it is not a fault and not an unknown, it is an
 * API old enough to predate the contract version, and saying so is more useful than showing a blank
 * or the word undefined.
 */
describe('classifying an API contract version', () => {
    it('accepts a version inside the supported range', () => {
        expect(classifyContract(String(SUPPORTED_CONTRACT.min))).toEqual({
            kind: 'ok',
            version: SUPPORTED_CONTRACT.min,
        });
    });

    it('calls an API below the range older', () => {
        expect(classifyContract(String(SUPPORTED_CONTRACT.min - 1))).toEqual({
            kind: 'api-older',
            version: SUPPORTED_CONTRACT.min - 1,
        });
    });

    it('calls an API above the range newer', () => {
        expect(classifyContract(String(SUPPORTED_CONTRACT.max + 1))).toEqual({
            kind: 'api-newer',
            version: SUPPORTED_CONTRACT.max + 1,
        });
    });

    it('treats a missing header as an API too old to have one', () => {
        for (const value of [undefined, null, '', '   ']) {
            expect(classifyContract(value)).toEqual({ kind: 'absent' });
        }
    });

    it('treats an unparseable header as absent rather than as a fault', () => {
        // A proxy rewriting the header, or a version scheme nobody here knows about. Refusing to
        // run is right; blaming the user for a malformed number is not.
        for (const value of ['abc', '1.2', 'v1', 'NaN']) {
            expect(classifyContract(value)).toEqual({ kind: 'absent' });
        }
    });

    it('stops the console for every case except a supported version', () => {
        expect(isIncompatible({ kind: 'ok', version: 1 })).toBe(false);
        expect(isIncompatible({ kind: 'unknown' })).toBe(false);
        expect(isIncompatible({ kind: 'absent' })).toBe(true);
        expect(isIncompatible({ kind: 'api-older', version: 0 })).toBe(true);
        expect(isIncompatible({ kind: 'api-newer', version: 99 })).toBe(true);
    });
});

describe('recording what the last response said', () => {
    beforeEach(() => __resetContractForTests());

    it('starts knowing nothing, so a console with no traffic yet is not accused of a mismatch', () => {
        expect(getContractState()).toEqual({ kind: 'unknown' });
        expect(isIncompatible(getContractState())).toBe(false);
    });

    it('notices the answer changing under a running session', () => {
        // A rolling upgrade: the API this console has been talking to is replaced mid-session. The
        // header is on every response precisely so this is visible.
        //
        // Derived from the range rather than written as a number, because the number that is one
        // past the range changes every time the range widens, and a literal here would have turned
        // into an assertion that a supported version is a mismatch.
        const tooNew = SUPPORTED_CONTRACT.max + 1;

        recordContractVersion(String(SUPPORTED_CONTRACT.min));
        expect(getContractState()).toEqual({ kind: 'ok', version: SUPPORTED_CONTRACT.min });

        recordContractVersion(String(tooNew));
        expect(getContractState()).toEqual({ kind: 'api-newer', version: tooNew });
    });

    it('keeps running when a rolling upgrade moves the API across the range', () => {
        // The coordinated release this range exists for: old pods answer with one version and new
        // pods with the next while the rollout is in flight, so a session sees both. Both are
        // supported, so the console must not blink.
        recordContractVersion(String(SUPPORTED_CONTRACT.min));
        recordContractVersion(String(SUPPORTED_CONTRACT.max));
        expect(getContractState()).toEqual({ kind: 'ok', version: SUPPORTED_CONTRACT.max });
        expect(isIncompatible(getContractState())).toBe(false);
    });

    it('keeps a mismatch when a later response carries no header', () => {
        const tooNew = SUPPORTED_CONTRACT.max + 1;

        recordContractVersion(String(tooNew));
        recordContractVersion(undefined);
        expect(getContractState()).toEqual({ kind: 'api-newer', version: tooNew });
        expect(isIncompatible(getContractState())).toBe(true);
    });

    it('does not take a working console down because one response lost the header', () => {
        // Every response from this API carries the version, so a bare one is far more likely to be
        // a proxy stripping headers, or a cached or synthetic response, than the API having become
        // older halfway through a session.
        recordContractVersion(String(SUPPORTED_CONTRACT.min));
        recordContractVersion(undefined);
        expect(getContractState()).toEqual({ kind: 'ok', version: SUPPORTED_CONTRACT.min });
        expect(isIncompatible(getContractState())).toBe(false);
    });

    it('still refuses an API that has never reported a version', () => {
        recordContractVersion(undefined);
        expect(getContractState()).toEqual({ kind: 'absent' });
        expect(isIncompatible(getContractState())).toBe(true);
    });

    it('tells subscribers only when the answer actually changes', () => {
        let calls = 0;
        subscribeToContract(() => calls++);

        recordContractVersion('1');
        expect(calls).toBe(1);

        recordContractVersion('1');
        recordContractVersion('1');
        expect(calls).toBe(1);

        recordContractVersion('2');
        expect(calls).toBe(2);
    });
});

/**
 * Which versions this build actually speaks, written as numbers.
 *
 * Everything above derives its input from SUPPORTED_CONTRACT, so it passes whatever the range holds
 * and proves nothing about the range itself. These are literal on purpose: 1 is what barakoCMS sent
 * up to 4.0.1, 2 is what the release enforcing slug uniqueness sends (BaryoDev/barakoCMS#717), 3 is
 * 4.1.0, which refuses the seeded role names (BaryoDev/barakoCMS#740), and a console that speaks
 * only some of them goes blank against the rest.
 *
 * Widening the range is a decision about what this build handles, not a number carried along, so
 * these have to be edited by hand when it moves.
 */
describe('the contract versions this build speaks', () => {
    it('speaks 1, 2 and 3', () => {
        expect(SUPPORTED_CONTRACT).toEqual({ min: 1, max: 3 });
    });

    it('accepts both of them from a response', () => {
        expect(classifyContract('1')).toEqual({ kind: 'ok', version: 1 });
        expect(classifyContract('2')).toEqual({ kind: 'ok', version: 2 });
        expect(classifyContract('3')).toEqual({ kind: 'ok', version: 3 });
    });

    it('still refuses 0 as too old and 4 as too new', () => {
        expect(classifyContract('0')).toEqual({ kind: 'api-older', version: 0 });
        expect(classifyContract('4')).toEqual({ kind: 'api-newer', version: 4 });
    });
});
