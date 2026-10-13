import { describe, expect, it } from 'vitest';
import { isFieldChangeRunning, isForceableConflict } from './field-change';

function refusal(status: number, errors: unknown) {
    return { isAxiosError: true, response: { status, data: { status, errors } } };
}

describe('telling a running field change from a conflict force can override', () => {
    it('reads the 409 naming the route as a running field change, which force does not get past', () => {
        const running = refusal(409, [{ name: 'name', reason: "'post' has a field change running (1). Try again when it completes." }]);

        expect(isFieldChangeRunning(running)).toBe(true);
        expect(isForceableConflict(running)).toBe(false);
    });

    it('reads a general 409 as one force can override', () => {
        const held = refusal(409, [{ name: 'generalErrors', reason: "3 entries hold 'WALK'." }]);

        expect(isFieldChangeRunning(held)).toBe(false);
        expect(isForceableConflict(held)).toBe(true);
    });

    it('reads neither into a 400 naming the same key', () => {
        const invalid = refusal(400, [{ name: 'name', reason: 'Name is required.' }]);

        expect(isFieldChangeRunning(invalid)).toBe(false);
        expect(isForceableConflict(invalid)).toBe(false);
    });
});
