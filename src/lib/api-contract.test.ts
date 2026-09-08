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
        recordContractVersion('1');
        expect(getContractState()).toEqual({ kind: 'ok', version: 1 });

        recordContractVersion('2');
        expect(getContractState()).toEqual({ kind: 'api-newer', version: 2 });
    });

    it('keeps a mismatch when a later response carries no header', () => {
        recordContractVersion('2');
        recordContractVersion(undefined);
        expect(getContractState()).toEqual({ kind: 'api-newer', version: 2 });
        expect(isIncompatible(getContractState())).toBe(true);
    });

    it('does not take a working console down because one response lost the header', () => {
        // Every response from this API carries the version, so a bare one is far more likely to be
        // a proxy stripping headers, or a cached or synthetic response, than the API having become
        // older halfway through a session.
        recordContractVersion('1');
        recordContractVersion(undefined);
        expect(getContractState()).toEqual({ kind: 'ok', version: 1 });
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
