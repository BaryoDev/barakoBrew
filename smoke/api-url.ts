/**
 * Where the unmocked pack sends the seeded administrator's bearer token.
 *
 * Every spec here authenticates as that administrator, and `SMOKE_API_URL` decides which origin
 * receives the header. The default is loopback, so the token never leaves the machine running the
 * stack. An override could point anywhere, and an `http:` override pointing off-box puts a working
 * administrator credential on the wire in clear text, where anything between here and there can read
 * and replay it.
 *
 * So the override is checked rather than trusted. `https:` goes anywhere, because the token is
 * protected in transit. Plain `http:` is allowed only to loopback, which is the case the default
 * covers and the one a local run or a CI service container actually needs. Anything else fails the
 * run with a sentence saying why, instead of leaking the credential and passing.
 */

const DEFAULT_API = 'http://127.0.0.1:5099';

/** 127.0.0.0/8 and the IPv6 loopback, which is every spelling of "this machine" a URL can carry. */
function isLoopback(hostname: string): boolean {
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host === '[::1]' || host === '::1') return true;
    return /^127(?:\.\d{1,3}){3}$/.test(host);
}

/**
 * The API origin for a smoke spec, with no trailing slash so `${api}/api/...` is one path separator.
 *
 * Throws rather than falling back to the default when the override is unusable: a silent fallback
 * would run the whole pack against localhost while the operator believed they were testing the
 * origin they named, and report green for it.
 */
export function smokeApiUrl(raw: string | undefined = process.env.SMOKE_API_URL): string {
    const value = (raw ?? '').trim();
    if (!value) return DEFAULT_API;

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`SMOKE_API_URL is not a URL: ${value}`);
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error(`SMOKE_API_URL must be http: or https:, not ${url.protocol} (${value})`);
    }

    if (url.protocol === 'http:' && !isLoopback(url.hostname)) {
        throw new Error(
            `SMOKE_API_URL points at ${url.hostname} over plain http:, and these specs send the ` +
                'seeded administrator token to it as a bearer. Use https: for a remote API, or a ' +
                'loopback address for a local one.'
        );
    }

    return value.replace(/\/+$/, '');
}
