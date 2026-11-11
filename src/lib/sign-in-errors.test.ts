import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { wrongCode } from './sign-in-errors';

const WORDS = 'That code did not match.';

/** A FastEndpoints ProblemDetails body, which is what core answers with: reasons, no `message`. */
function problem(status: number, reason: string): AxiosError {
    return failure(status, undefined, {
        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.1',
        title: 'One or more errors occurred!',
        status,
        instance: '/api/auth/otp/verify',
        traceId: 'abc',
        errors: [{ name: 'generalErrors', reason }],
    });
}

function failure(status: number, message?: string, body?: unknown): AxiosError {
    const error = new AxiosError('failed');
    error.response = {
        status,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: body ?? (message === undefined ? undefined : { message }),
    };
    return error;
}

describe('wrongCode', () => {
    it('uses the design wording for an invalid or expired code', () => {
        expect(wrongCode(problem(400, 'Invalid or expired code.'), WORDS)).toBe(WORDS);
        expect(wrongCode(failure(400, 'Invalid or expired code.'), WORDS)).toBe(WORDS);
        expect(wrongCode(failure(401), WORDS)).toBe(WORDS);
        expect(wrongCode(failure(422, 'whatever'), WORDS)).toBe(WORDS);
    });

    it('keeps the server text when the attempts ran out', () => {
        expect(wrongCode(problem(400, 'Too many attempts. Please request a new code.'), WORDS)).toBe(
            'Too many attempts. Please request a new code.'
        );
        expect(wrongCode(failure(400, 'Too many attempts. Please request a new code.'), WORDS)).toBe(
            'Too many attempts. Please request a new code.'
        );
    });

    it('keeps the rate limit message', () => {
        expect(wrongCode(failure(429, 'Slow down.'), WORDS)).toContain('Slow down.');
    });

    it('keeps what a 403 said', () => {
        expect(wrongCode(failure(403, 'This account is locked.'), WORDS)).toBe('This account is locked.');
    });
});
