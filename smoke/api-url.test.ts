import { describe, expect, it } from 'vitest';
import { smokeApiUrl } from './api-url';

/**
 * These run in the unit suite, not the smoke pack, because the thing under test is the guard itself
 * and it must be checked without a stack behind it.
 *
 * The guard exists because every spec in `smoke/` sends the seeded administrator's token to whatever
 * `SMOKE_API_URL` names. A plain-http override pointing off-box would have put that credential on the
 * wire in clear, and the run would have passed.
 */
describe('the origin a smoke spec sends the administrator token to', () => {
    it('is loopback when nothing overrides it', () => {
        expect(smokeApiUrl(undefined)).toBe('http://127.0.0.1:5099');
        expect(smokeApiUrl('')).toBe('http://127.0.0.1:5099');
        expect(smokeApiUrl('   ')).toBe('http://127.0.0.1:5099');
    });

    it('accepts plain http only to this machine', () => {
        expect(smokeApiUrl('http://localhost:5099')).toBe('http://localhost:5099');
        expect(smokeApiUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
        expect(smokeApiUrl('http://127.0.1.1:8080')).toBe('http://127.0.1.1:8080');
        expect(smokeApiUrl('http://[::1]:5099')).toBe('http://[::1]:5099');
    });

    it('refuses plain http to anywhere else, because the token would be readable in transit', () => {
        for (const url of [
            'http://api.example.com',
            'http://10.0.0.5:5099',
            'http://192.168.1.20:5099',
            // The string starts with the loopback address but the host is not it, which is the
            // shape a prefix check would wave through.
            'http://127.0.0.1.example.com/',
            'http://evil.com/?x=http://127.0.0.1',
        ]) {
            expect(() => smokeApiUrl(url), url).toThrow(/plain http/);
        }
    });

    it('accepts https anywhere, since the token is protected in transit', () => {
        expect(smokeApiUrl('https://api.example.com')).toBe('https://api.example.com');
        expect(smokeApiUrl('https://api.example.com/')).toBe('https://api.example.com');
        expect(smokeApiUrl('https://api.example.com//')).toBe('https://api.example.com');
    });

    it('refuses a scheme that is neither, rather than building a request out of it', () => {
        expect(() => smokeApiUrl('ftp://api.example.com')).toThrow(/http: or https:/);
        expect(() => smokeApiUrl('file:///etc/passwd')).toThrow(/http: or https:/);
    });

    it('fails loudly on something that is not a URL, rather than quietly using the default', () => {
        expect(() => smokeApiUrl('127.0.0.1:5099')).toThrow(/not a URL/);
        expect(() => smokeApiUrl('nonsense')).toThrow(/not a URL/);
    });
});
