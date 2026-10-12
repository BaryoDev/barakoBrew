import { describe, it, expect } from 'vitest';
import { fieldFormSchema } from './field-form';
import type { FieldDefinition } from '@/types/schema';

const field = (overrides: Partial<FieldDefinition> = {}): FieldDefinition => ({
    name: 'Headline',
    displayName: 'Headline',
    type: 'string',
    isRequired: false,
    ...overrides,
});

/** The issues as `path: message`, so a test reads what the form would show and where. */
function issues(value: FieldDefinition, others: FieldDefinition[] = []): string[] {
    const result = fieldFormSchema(others).safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('fieldFormSchema', () => {
    it('passes a plain field with a name and a display name', () => {
        expect(fieldFormSchema([]).safeParse(field()).success).toBe(true);
    });

    it('files every refusal under the member that has to change', () => {
        const refused = issues(
            field({
                name: 'title',
                displayName: '',
                type: 'money',
                currency: '',
                scale: 2,
                section: ' Details',
                role: 'title',
            }),
            [field({ name: 'Heading', displayName: 'Heading', role: 'title' })]
        );

        expect(refused).toHaveLength(5);
        expect(refused).toEqual([
            'displayName: Give the field a display name.',
            'name: Use PascalCase: start with a capital letter, letters and numbers only.',
            'section: A section cannot be blank or start or end with a space.',
            'currency: Set a currency before a number of decimal places.',
            'role: Heading already holds this role. One field of a type holds a role.',
        ]);
    });

    it('refuses a name another field holds in another case, and not the field itself', () => {
        expect(issues(field({ name: 'HEADLINE' }), [field()])).toEqual([
            'name: A field with this name already exists, ignoring case.',
        ]);
        expect(issues(field(), [])).toEqual([]);
    });

    it('refuses a reference with no target, a choice with a bad option and a token out of range', () => {
        expect(issues(field({ type: 'reference', referenceType: '  ' }))).toEqual([
            'referenceType: Name the content type the entries are picked from.',
        ]);
        expect(issues(field({ type: 'choice', options: [{ value: '', label: '' }] }))).toEqual([
            'options: Fix the options before adding the field.',
        ]);
        expect(issues(field({ type: 'token', tokenLength: 8 }))).toEqual([
            'tokenLength: A token is 16 to 128 characters long.',
        ]);
    });
});
