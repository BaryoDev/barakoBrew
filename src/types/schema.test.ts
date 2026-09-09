import { describe, it, expect } from 'vitest';
import {
    FIELD_TYPES,
    FIELD_TYPE_ALIASES,
    FIELD_TYPE_GROUPS,
    fieldTypeLabel,
    resolveFieldType,
} from './schema';

/**
 * The server's FieldTypeRegistry is the source of truth and this file is a hand-kept copy of it,
 * because the API publishes neither an endpoint nor an OpenAPI enum for the set (see the comment
 * on FIELD_TYPES). So the copy is pinned here by name rather than by count alone: a count assertion
 * on its own passes when one type is swapped for another.
 *
 * Every canonical name in Core/Validation/FieldTypeRegistry.cs, as of 4.0.
 */
const REGISTRY_CANONICAL = [
    'array',
    'bool',
    'date',
    'datetime',
    'decimal',
    'email',
    'geopoint',
    'int',
    'json',
    'markdown',
    'money',
    'object',
    'reference',
    'richtext',
    'slug',
    'string',
    'text',
    'time',
    'url',
    'uuid',
];

describe('the field type list', () => {
    it('carries every type the registry accepts and nothing else', () => {
        const values = FIELD_TYPES.map((t) => t.value).sort();

        expect(values).toEqual([...REGISTRY_CANONICAL].sort());
    });

    it('gives every type a label and a description', () => {
        for (const type of FIELD_TYPES) {
            expect(type.label, type.value).not.toBe('');
            expect(type.description, type.value).not.toBe('');
        }
    });

    it('names each type once', () => {
        expect(new Set(FIELD_TYPES.map((t) => t.value)).size).toBe(FIELD_TYPES.length);
    });
});

describe('the grouped picker', () => {
    // The groups and their membership come from the Add-a-field panel in the design.
    const EXPECTED: Record<string, string[]> = {
        Text: ['string', 'text', 'richtext', 'markdown', 'slug', 'uuid'],
        Numbers: ['int', 'decimal', 'money'],
        Time: ['date', 'datetime', 'time'],
        'True or false': ['bool'],
        Structured: ['array', 'object', 'json', 'geopoint'],
        'Checked on write': ['email', 'url', 'reference'],
    };

    it('groups the types the way the design groups them', () => {
        const actual = Object.fromEntries(
            FIELD_TYPE_GROUPS.map((g) => [g.label, g.types.map((t) => t.value)]),
        );

        expect(actual).toEqual(EXPECTED);
    });

    it('keeps the groups in the design order', () => {
        expect(FIELD_TYPE_GROUPS.map((g) => g.label)).toEqual(Object.keys(EXPECTED));
    });

    it('accounts for every type exactly once, so the flat list and the groups cannot drift', () => {
        // The flat list is what the detail screen looks labels up in. A type present in one and
        // missing from the other is the drift this issue is about, one level down.
        const grouped = FIELD_TYPE_GROUPS.flatMap((g) => g.types.map((t) => t.value));

        expect(grouped.sort()).toEqual(FIELD_TYPES.map((t) => t.value).sort());
    });

    it('offers no alias as a type of its own', () => {
        const offered = FIELD_TYPE_GROUPS.flatMap((g) => g.types.map((t) => t.value));

        for (const alias of Object.keys(FIELD_TYPE_ALIASES)) {
            expect(offered).not.toContain(alias);
        }
    });
});

describe('resolveFieldType', () => {
    it('returns a canonical type unchanged', () => {
        expect(resolveFieldType('string')).toBe('string');
        expect(resolveFieldType('geopoint')).toBe('geopoint');
    });

    it('resolves the aliases the registry declares', () => {
        expect(resolveFieldType('integer')).toBe('int');
        expect(resolveFieldType('number')).toBe('int');
        expect(resolveFieldType('boolean')).toBe('bool');
    });

    it('matches case-insensitively, as the registry lookup does', () => {
        // The server accepts 'Integer' and stores it as written, so that is what arrives here.
        expect(resolveFieldType('Integer')).toBe('int');
        expect(resolveFieldType('STRING')).toBe('string');
    });

    it('returns undefined for a type it has never heard of', () => {
        // Not a fallback to string: a type this console does not know is a fact worth showing,
        // and guessing would render a field as something it is not.
        expect(resolveFieldType('vector')).toBeUndefined();
        expect(resolveFieldType('')).toBeUndefined();
    });
});

describe('fieldTypeLabel', () => {
    it('labels an alias with its type, not with the raw string', () => {
        expect(fieldTypeLabel('integer')).toBe(fieldTypeLabel('int'));
        expect(fieldTypeLabel('number')).toBe(fieldTypeLabel('int'));
        expect(fieldTypeLabel('boolean')).toBe(fieldTypeLabel('bool'));
    });

    it('shows an unknown type as the server sent it', () => {
        expect(fieldTypeLabel('vector')).toBe('vector');
    });

    it('labels the three types the picker was missing', () => {
        expect(fieldTypeLabel('text')).not.toBe('text');
        expect(fieldTypeLabel('geopoint')).not.toBe('geopoint');
        expect(fieldTypeLabel('reference')).not.toBe('reference');
    });
});
