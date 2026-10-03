import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { apiErrorMessage, retryAfterText } from './api';

/**
 * The server sends RFC7807 ProblemDetails, whose entries carry `name` and `reason`.
 *
 * apiErrorMessage read `message` and fell back to the entry object itself, so every validation
 * failure rendered as "[object Object]" instead of the server's text. That included the failed
 * login on the sign-in page, which is the first error most people ever see from this product.
 */
function problemDetails(errors: unknown, status = 400) {
    const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST');
    error.response = {
        data: { errors },
        status,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    };
    return error;
}

describe('apiErrorMessage', () => {
    it('reads the reason from a ProblemDetails entry', () => {
        const error = problemDetails([{ name: 'generalErrors', reason: 'Invalid credentials' }]);

        expect(apiErrorMessage(error)).toBe('Invalid credentials');
    });

    it('joins several ProblemDetails entries', () => {
        const error = problemDetails([
            { name: 'contentType', reason: 'ContentType is required' },
            { name: 'data', reason: 'Data is required' },
        ]);

        expect(apiErrorMessage(error)).toBe('ContentType is required, Data is required');
    });

    it('never renders an entry as [object Object]', () => {
        const error = problemDetails([{ name: 'field', someOtherShape: 'surprise' }]);

        expect(apiErrorMessage(error)).not.toContain('[object Object]');
    });

    it('falls back rather than returning an empty string when nothing is readable', () => {
        const error = problemDetails([{}]);

        expect(apiErrorMessage(error, 'Something went wrong')).toBe('Something went wrong');
    });

    it('still handles a plain string array', () => {
        const error = problemDetails(['Invalid credentials']);

        expect(apiErrorMessage(error)).toBe('Invalid credentials');
    });

    // Auth failures moved from 400 to 401 in 4.0. apiErrorMessage falls back to
    // "Your session has expired" on a 401 with nothing readable in it, so the server's reason has
    // to win, or the most visible error in the product becomes a misleading one.
    it('prefers the server reason over the session-expired fallback on a 401', () => {
        const error = problemDetails([{ name: 'generalErrors', reason: 'Invalid credentials' }], 401);

        expect(apiErrorMessage(error)).toBe('Invalid credentials');
    });

    it('still falls back to session-expired on a 401 with no body', () => {
        const error = new AxiosError('Unauthorized', 'ERR_BAD_REQUEST');
        error.response = {
            data: undefined,
            status: 401,
            statusText: '',
            headers: {},
            config: { headers: new AxiosHeaders() },
        };

        expect(apiErrorMessage(error)).toBe('Your session has expired. Sign in again.');
    });
});

function tooMany(body: unknown, headers: Record<string, string> = {}) {
    const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST');
    error.response = { data: body, status: 429, statusText: '', headers, config: { headers: new AxiosHeaders() } };
    return error;
}

describe('apiErrorMessage on a 429', () => {
    it('repeats the API text as it stands when no wait is given, which is every release so far', () => {
        expect(apiErrorMessage(tooMany('Too many requests. Please try again later.'))).toBe(
            'Too many requests. Please try again later.',
        );
    });

    it('says to wait a moment when the 429 has no text either', () => {
        expect(apiErrorMessage(tooMany(''))).toBe('Too many requests. Wait a moment and try again.');
    });

    it('adds the wait when Retry-After gives seconds', () => {
        expect(apiErrorMessage(tooMany('Too many requests. Please try again later.', { 'retry-after': '45' }))).toBe(
            'Too many requests. Please try again later. Try again in 45 seconds.',
        );
    });
});

describe('retryAfterText', () => {
    const NOW = new Date('2026-10-03T12:00:00Z');

    it('reads seconds and rounds minutes up', () => {
        expect(retryAfterText('1', NOW)).toBe('1 second');
        expect(retryAfterText('90', NOW)).toBe('2 minutes');
    });

    it('reads an HTTP date', () => {
        expect(retryAfterText('Sat, 03 Oct 2026 12:05:00 GMT', NOW)).toBe('5 minutes');
    });

    it('is null for nothing, a past date or text it cannot read', () => {
        expect(retryAfterText(undefined, NOW)).toBeNull();
        expect(retryAfterText('0', NOW)).toBeNull();
        expect(retryAfterText('Sat, 03 Oct 2026 11:00:00 GMT', NOW)).toBeNull();
        expect(retryAfterText('soon', NOW)).toBeNull();
    });
});
