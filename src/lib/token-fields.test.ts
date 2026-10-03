import { describe, it, expect } from 'vitest';
import { withoutTokenFields } from './token-fields';
import type { FieldDefinition } from '@/types/schema';

const FIELDS: FieldDefinition[] = [
    { name: 'Name', displayName: 'Name', type: 'string', isRequired: false },
    { name: 'ClaimToken', displayName: 'Claim token', type: 'token', isRequired: false },
];

describe('a save never sends a token', () => {
    it('leaves the token field out and keeps the rest', () => {
        const sent = withoutTokenFields(FIELDS, { Name: 'Ana', ClaimToken: 'abcdefghjkmnpqrs' });

        expect(sent).toEqual({ Name: 'Ana' });
    });

    it('matches the field in the data without regard to case', () => {
        expect(withoutTokenFields(FIELDS, { Name: 'Ana', claimtoken: 'abcdefghjkmnpqrs' })).toEqual({ Name: 'Ana' });
    });

    it('returns the data as it was for a type with no token field', () => {
        const data = { Name: 'Ana' };
        expect(withoutTokenFields(FIELDS.slice(0, 1), data)).toBe(data);
    });
});
