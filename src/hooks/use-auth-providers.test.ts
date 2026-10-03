import { describe, expect, it } from 'vitest';
import { oidcSignInUrl, readOidcProviders } from './use-auth-providers';

describe('the OpenID Connect providers the API lists', () => {
    it('keeps each well-formed provider with its display name', () => {
        const providers = readOidcProviders([
            { name: 'entra', displayName: 'Company sign-in' },
            { name: 'okta', displayName: 'Okta' },
        ]);
        expect(providers).toHaveLength(2);
        expect(providers).toEqual([
            { name: 'entra', displayName: 'Company sign-in' },
            { name: 'okta', displayName: 'Okta' },
        ]);
    });

    it('reads a missing array, from an API before ExternalAuth 4.4.0, as none', () => {
        expect(readOidcProviders(undefined)).toEqual([]);
        expect(readOidcProviders(null)).toEqual([]);
        expect(readOidcProviders({ name: 'entra' })).toEqual([]);
    });

    it('drops an entry whose name could not be a route segment', () => {
        const providers = readOidcProviders([
            { name: '../admin', displayName: 'Bad' },
            { name: 'UPPER', displayName: 'Bad' },
            { name: '', displayName: 'Bad' },
            { displayName: 'No name' },
            'entra',
            { name: 'good-one', displayName: 'Good' },
        ]);
        expect(providers).toHaveLength(1);
        expect(providers[0].name).toBe('good-one');
    });

    it('falls back to the name when the display name is missing or blank', () => {
        expect(readOidcProviders([{ name: 'entra' }, { name: 'okta', displayName: '  ' }])).toEqual([
            { name: 'entra', displayName: 'entra' },
            { name: 'okta', displayName: 'okta' },
        ]);
    });

    it('starts a sign-in at the provider start route on the API', () => {
        expect(oidcSignInUrl('entra')).toMatch(/\/api\/auth\/oidc\/entra\/start$/);
    });
});
