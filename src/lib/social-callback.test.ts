import { describe, expect, it } from 'vitest';
import { parseSocialFragment, signInErrorFromQuery } from './social-callback';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnQiOiJub3J0aCJ9.c2ln';

describe('parseSocialFragment', () => {
    it('reads the tokens and the club the API sends after a sign-in', () => {
        expect(parseSocialFragment(`#token=${JWT}&refresh=r%2Bf%3D&club=north`)).toEqual({
            kind: 'tokens',
            token: JWT,
            refresh: 'r+f=',
            club: 'north',
        });
    });

    it('reads an empty club as the default tenant', () => {
        const fragment = parseSocialFragment(`#token=${JWT}&refresh=abc&club=`);
        expect(fragment.kind).toBe('tokens');
        expect(fragment.kind === 'tokens' && fragment.club).toBe('');
    });

    it('reads an MFA challenge', () => {
        expect(parseSocialFragment('#mfa_challenge=chal.lenge&club=north')).toEqual({
            kind: 'mfa',
            challenge: 'chal.lenge',
            club: 'north',
        });
    });

    it('is invalid when the fragment is missing or empty', () => {
        expect(parseSocialFragment('')).toEqual({ kind: 'invalid' });
        expect(parseSocialFragment('#')).toEqual({ kind: 'invalid' });
    });

    it('is invalid when half the tokens are missing', () => {
        expect(parseSocialFragment(`#token=${JWT}`)).toEqual({ kind: 'invalid' });
        expect(parseSocialFragment('#refresh=abc')).toEqual({ kind: 'invalid' });
    });

    it('is invalid when the token is not a JWT', () => {
        expect(parseSocialFragment('#token=not-a-jwt&refresh=abc')).toEqual({ kind: 'invalid' });
    });

    it('is invalid when tokens and a challenge arrive together, or a key is repeated', () => {
        expect(parseSocialFragment(`#token=${JWT}&refresh=a&mfa_challenge=c`)).toEqual({ kind: 'invalid' });
        expect(parseSocialFragment(`#token=${JWT}&token=${JWT}&refresh=a`)).toEqual({ kind: 'invalid' });
        expect(parseSocialFragment('#mfa_challenge=c&club=a&club=b')).toEqual({ kind: 'invalid' });
    });

    it('reads a club with a control character as the default tenant rather than a header value', () => {
        const fragment = parseSocialFragment('#mfa_challenge=c&club=a%0D%0AX-Evil%3A1');
        expect(fragment).toEqual({ kind: 'mfa', challenge: 'c', club: '' });
    });
});

describe('signInErrorFromQuery', () => {
    it('reads the sentence the API put in fberror', () => {
        expect(
            signInErrorFromQuery("?fberror=Couldn't%20reach%20Company%20sign-in.%20Please%20try%20again%2C%20or%20use%20your%20email%20code."),
        ).toBe("Couldn't reach Company sign-in. Please try again, or use your email code.");
    });

    it('is null without one', () => {
        expect(signInErrorFromQuery('')).toBeNull();
        expect(signInErrorFromQuery('?other=1')).toBeNull();
        expect(signInErrorFromQuery('?fberror=%20%20')).toBeNull();
    });

    it('removes control characters and bidi overrides and caps the length', () => {
        expect(signInErrorFromQuery('?fberror=a%0D%0Ab%E2%80%AEc')).toBe('a b c');
        const long = signInErrorFromQuery(`?fberror=${'x'.repeat(500)}`)!;
        expect(long).toHaveLength(303);
        expect(long.endsWith('...')).toBe(true);
    });
});
