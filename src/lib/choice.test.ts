import { describe, it, expect } from 'vitest';
import { choiceProblems, hasOptionIssues, optionIssues } from './choice';
import type { FieldDefinition } from '@/types/schema';

describe('optionIssues', () => {
    it('flags the second of two values that differ only in case', () => {
        const issues = optionIssues([
            { value: 'FUN', label: 'Fun run' },
            { value: 'COMPETE', label: 'Competitive' },
            { value: 'fun', label: 'Also fun' },
        ]);

        expect(issues.rows).toHaveLength(3);
        expect(issues.rows[0]).toBeNull();
        expect(issues.rows[1]).toBeNull();
        expect(issues.rows[2]).toMatch(/only in case/);
        expect(hasOptionIssues(issues)).toBe(true);
    });

    it('refuses an empty list, an empty value, surrounding space and the length limits', () => {
        expect(optionIssues([]).list).toBe('Add at least one option.');

        const rows = optionIssues([
            { value: '', label: 'x' },
            { value: ' S', label: 'x' },
            { value: 'V'.repeat(101), label: 'x' },
            { value: 'OK', label: 'L'.repeat(201) },
        ]).rows;
        expect(rows).toHaveLength(4);
        expect(rows.every((row) => row !== null)).toBe(true);
    });

    it('refuses more than 200 options', () => {
        const options = Array.from({ length: 201 }, (_, i) => ({ value: `V${i}`, label: '' }));
        expect(optionIssues(options).list).toMatch(/at most 200/);
    });

    it('accepts a clean list, empty labels included', () => {
        const issues = optionIssues([
            { value: 'S', label: '' },
            { value: 'M', label: 'Medium' },
        ]);
        expect(hasOptionIssues(issues)).toBe(false);
    });
});

describe('choiceProblems', () => {
    const fields: FieldDefinition[] = [
        { name: 'Title', displayName: 'Title', type: 'string', isRequired: false },
        {
            name: 'Kind',
            displayName: 'Kind',
            type: 'choice',
            isRequired: false,
            options: [{ value: 'A', label: 'A' }],
        },
    ];

    it('names only the choice fields holding a value no longer offered', () => {
        expect(choiceProblems(fields, { Title: 'B', Kind: 'A' })).toEqual({});
        expect(Object.keys(choiceProblems(fields, { Title: 'B', Kind: 'B' }))).toEqual(['Kind']);
    });

    it('skips a choice left holding exactly what is stored, when the stored entry is given', () => {
        expect(Object.keys(choiceProblems(fields, { Kind: 'B' }))).toEqual(['Kind']);
        expect(choiceProblems(fields, { Kind: 'B' }, { Kind: 'B' })).toEqual({});
        expect(Object.keys(choiceProblems(fields, { Kind: 'C' }, { Kind: 'B' }))).toEqual(['Kind']);
    });

    it('compares a stored list whole, order included, as the API does', () => {
        const multiple: FieldDefinition[] = [
            {
                name: 'Sizes',
                displayName: 'Sizes',
                type: 'choice',
                isRequired: false,
                multiple: true,
                options: [{ value: 'S', label: 'S' }, { value: 'M', label: 'M' }],
            },
        ];

        expect(choiceProblems(multiple, { Sizes: ['S', 'XXL'] }, { Sizes: ['S', 'XXL'] })).toEqual({});
        expect(Object.keys(choiceProblems(multiple, { Sizes: ['XXL', 'S'] }, { Sizes: ['S', 'XXL'] }))).toEqual(['Sizes']);
        expect(Object.keys(choiceProblems(multiple, { Sizes: ['S', 'M', 'XXL'] }, { Sizes: ['S', 'XXL'] }))).toEqual([
            'Sizes',
        ]);
    });
});
