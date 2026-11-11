import axios from 'axios';
import { apiErrorMessage } from '@/lib/api';

/**
 * What to say when a code is refused. The design's words are for the plain wrong or expired code
 * only (401, 422, or a 400 that says invalid or expired, or says nothing). Anything else keeps what
 * the server said, such as "Too many attempts. Please request a new code." or a rate limit, because
 * that one changes what the person does next.
 */
export function wrongCode(error: unknown, words: string): string {
    if (!axios.isAxiosError(error)) return apiErrorMessage(error, words);
    const status = error.response?.status;
    if (status === 401 || status === 422) return words;
    if (status === 400) {
        // Read the text the way apiErrorMessage does: ProblemDetails errors[].reason, then message,
        // then a string body. Core answers with ProblemDetails, which has no `message`.
        const said = apiErrorMessage(error, '');
        if (!said.trim() || /invalid|expired/i.test(said)) return words;
    }
    return apiErrorMessage(error, words);
}
