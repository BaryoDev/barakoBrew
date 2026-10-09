import { describe, expect, it } from 'vitest';
import { FALLBACK_CREDENTIAL_NAME_PARTS, credentialNameParts, readsAsCredential } from './credential-names';

describe('credentialNameParts', () => {
    it('takes the list the API publishes', () => {
        expect(credentialNameParts({ credentialNameParts: ['secret', 'signature'] })).toEqual(['secret', 'signature']);
    });

    it('falls back to the console copy for an API that sends none, an empty list or not a list of words', () => {
        expect(FALLBACK_CREDENTIAL_NAME_PARTS.length).toBeGreaterThan(0);
        expect(credentialNameParts(undefined)).toBe(FALLBACK_CREDENTIAL_NAME_PARTS);
        expect(credentialNameParts({ apiContractVersion: 6 })).toBe(FALLBACK_CREDENTIAL_NAME_PARTS);
        expect(credentialNameParts({ credentialNameParts: [] })).toBe(FALLBACK_CREDENTIAL_NAME_PARTS);
        expect(credentialNameParts({ credentialNameParts: ['secret', 3] })).toBe(FALLBACK_CREDENTIAL_NAME_PARTS);
        expect(credentialNameParts({ credentialNameParts: 'secret' })).toBe(FALLBACK_CREDENTIAL_NAME_PARTS);
    });
});

describe('readsAsCredential', () => {
    it('matches a word anywhere in the name, ignoring case, as the API does', () => {
        expect(readsAsCredential('X-Api_Key-Header')).toBe(true);
        expect(readsAsCredential('ClientSecret')).toBe(true);
        expect(readsAsCredential('Author')).toBe(false);
    });
});
