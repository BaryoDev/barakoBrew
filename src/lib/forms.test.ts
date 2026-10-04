import { describe, expect, it } from 'vitest';
import { formCandidates, supportsEmailVerification, verifiableEmailFields } from './forms';

describe('formCandidates', () => {
    it('leaves out single-entry types', () => {
        const types = [
            { name: 'signup', fields: [] },
            { name: 'site', isSingleton: true, fields: [] },
        ];
        expect(formCandidates(types).map((t) => t.name)).toEqual(['signup']);
    });
});

describe('verifiableEmailFields', () => {
    it('keeps Public email fields and drops the rest', () => {
        const fields = verifiableEmailFields({
            name: 't',
            fields: [
                { name: 'Email', type: 'email' },
                { name: 'Work', type: 'Email', sensitivity: 'Public' },
                { name: 'Private', type: 'email', sensitivity: 'Sensitive' },
                { name: 'Name', type: 'string' },
                { name: 'slug', type: 'email' },
            ],
        });
        expect(fields.map((f) => f.name)).toEqual(['Email', 'Work']);
    });
});

describe('supportsEmailVerification', () => {
    it('reads the field off any form, null included', () => {
        expect(supportsEmailVerification([{ contentType: 'a', verifyEmailField: null }])).toBe(true);
        expect(supportsEmailVerification([{ contentType: 'a' }])).toBe(false);
    });

    it('offers the choice when there are no forms to read', () => {
        expect(supportsEmailVerification([])).toBe(true);
    });
});
