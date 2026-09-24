import { describe, expect, it } from 'vitest';
import { supportsKeyContentTypes, type ApiKey } from './use-api-keys';

const key = (extra: Partial<ApiKey> = {}): ApiKey => ({
    id: 'k',
    name: 'k',
    prefix: 'bcms_x',
    scopes: ['content:read'],
    tenantSlug: 'default',
    revoked: false,
    createdAt: '2026-09-01T00:00:00Z',
    ...extra,
});

describe('whether the API limits a key to content types', () => {
    it('does when a listed key carries contentTypes, even an empty list', () => {
        expect(supportsKeyContentTypes([key({ contentTypes: [] })], undefined)).toBe(true);
    });

    it('does not when listed keys carry no contentTypes, whatever the version says', () => {
        expect(supportsKeyContentTypes([key(), key()], '9.0.0')).toBe(false);
    });

    it('reads the API version when there are no keys to read', () => {
        expect(supportsKeyContentTypes([], '4.4.0')).toBe(true);
        expect(supportsKeyContentTypes([], '5.0.1')).toBe(true);
        expect(supportsKeyContentTypes([], '4.3.9')).toBe(false);
        expect(supportsKeyContentTypes([], '3.21.0')).toBe(false);
    });

    it('does not when there are no keys and no version to go on', () => {
        expect(supportsKeyContentTypes([], undefined)).toBe(false);
        expect(supportsKeyContentTypes(undefined, undefined)).toBe(false);
        expect(supportsKeyContentTypes([], 'not a version')).toBe(false);
    });
});
