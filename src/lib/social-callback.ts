/**
 * What an external sign-in hands back, read off the address the API redirected to.
 *
 * The API's callbacks (the four social providers and every OpenID Connect provider) end in one of:
 *
 *   {App:BaseUrl}/auth/social#token=...&refresh=...&club=...
 *   {App:BaseUrl}/auth/social#mfa_challenge=...&club=...
 *   {App:BaseUrl}/login?fberror=<a sentence>
 *
 * The tokens ride in the fragment so they never reach a server log or a Referer. This module only
 * parses; the page clears the fragment before it does anything else.
 */

export type SocialFragment =
    | { kind: 'tokens'; token: string; refresh: string; club: string }
    | { kind: 'mfa'; challenge: string; club: string }
    | { kind: 'invalid' };

/** A JWT is three base64url parts; anything else in `token` is not one. */
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

/** The longest value read from the fragment. A real one is well under this. */
const MAX_VALUE = 8192;

/**
 * The club (tenant) the sign-in was for, lowercased and at most 100 characters by the API. It goes
 * into an X-Tenant header, so anything outside printable ASCII is read as the default tenant.
 */
const CLUB = /^[\x21-\x7E]{1,100}$/;

export function parseSocialFragment(hash: string): SocialFragment {
    const raw = hash.startsWith('#') ? hash.slice(1) : hash;
    if (raw.length === 0 || raw.length > MAX_VALUE * 3) return { kind: 'invalid' };

    let params: URLSearchParams;
    try {
        params = new URLSearchParams(raw);
    } catch {
        return { kind: 'invalid' };
    }

    const read = (key: string): string | null => {
        const values = params.getAll(key);
        // One value or none. Two is a fragment someone built by hand, and picking one is a guess.
        if (values.length !== 1) return null;
        const value = values[0].trim();
        return value.length > 0 && value.length <= MAX_VALUE ? value : null;
    };

    const clubValue = params.getAll('club').length <= 1 ? (params.get('club') ?? '').trim() : null;
    if (clubValue === null) return { kind: 'invalid' };
    const club = CLUB.test(clubValue) ? clubValue : '';

    const token = read('token');
    const refresh = read('refresh');
    const challenge = read('mfa_challenge');

    if (challenge && !token && !refresh) return { kind: 'mfa', challenge, club };
    if (token && refresh && !challenge && JWT.test(token)) return { kind: 'tokens', token, refresh, club };
    return { kind: 'invalid' };
}

/** The longest provider message shown on the sign-in page. The API's own are one sentence. */
const MAX_MESSAGE = 300;

/**
 * The sentence the API put in `?fberror=`, ready to show as text, or null.
 *
 * The API writes these ("Couldn't reach Company sign-in. Please try again, or use your email
 * code."), but anyone can send a link to `/login?fberror=...`, so it is shown as plain text only,
 * with control characters removed and its length capped.
 */
export function signInErrorFromQuery(search: string): string | null {
    let value: string | null;
    try {
        value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('fberror');
    } catch {
        return null;
    }
    if (!value) return null;
    // eslint-disable-next-line no-control-regex -- control characters are what this removes.
    const cleaned = value.replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length === 0) return null;
    return cleaned.length > MAX_MESSAGE ? `${cleaned.slice(0, MAX_MESSAGE)}...` : cleaned;
}
