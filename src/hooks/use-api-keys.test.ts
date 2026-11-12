import { describe, expect, it } from 'vitest';
import { apiKeyRotationSchema, inOverlap, overlapLabel, OVERLAP_STOPS, DEFAULT_OVERLAP_INDEX, timeLeft, supportsKeyContentTypes, type ApiKey } from './use-api-keys';

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

describe('the overlap stops', () => {
    it('are the seven the design draws, with 60 minutes the default', () => {
        expect([...OVERLAP_STOPS]).toEqual([0, 15, 60, 240, 1440, 4320, 10080]);
        expect(OVERLAP_STOPS[DEFAULT_OVERLAP_INDEX]).toBe(60);
        expect(OVERLAP_STOPS.map(overlapLabel)).toEqual(['none', '15 min', '60 min', '4 h', '24 h', '3 days', '7 days']);
    });
});

describe('time left on an old key', () => {
    const now = Date.parse('2026-11-06T10:00:00Z');
    it('reads minutes, hours and days, and says already stopped once past', () => {
        expect(timeLeft('2026-11-06T11:00:00Z', now)).toBe('in 60 min');
        expect(timeLeft('2026-11-06T14:00:00Z', now)).toBe('in 4 h');
        expect(timeLeft('2026-11-13T10:00:00Z', now)).toBe('in 7 days');
        expect(timeLeft('2026-11-06T10:00:00Z', now)).toBe('already stopped');
        expect(timeLeft(null, now)).toBeNull();
        expect(timeLeft('soon', now)).toBeNull();
    });
});

describe('the rotation marker', () => {
    const now = Date.parse('2026-11-06T10:00:00Z');
    it('makes a replaced key with time left an overlap', () => {
        expect(inOverlap(key({ replacedBy: 'k2', expiresAt: '2026-11-06T11:00:00Z' }), now)).toBe(true);
    });
    it('does not call an ordinary expiry an overlap, and a stopped or revoked key is not one', () => {
        expect(inOverlap(key({ expiresAt: '2026-11-06T11:00:00Z' }), now)).toBe(false);
        expect(inOverlap(key({ replacedBy: 'k2', expiresAt: '2026-11-06T09:00:00Z' }), now)).toBe(false);
        expect(inOverlap(key({ replacedBy: 'k2', revoked: true, expiresAt: '2026-11-06T11:00:00Z' }), now)).toBe(false);
    });
    it('reads replacedBy, replaces and kind when present and leaves them off when absent', () => {
        expect(apiKeyRotationSchema.parse({ replacedBy: 'a', replaces: 'b', kind: 'readOnly' })).toMatchObject({ replacedBy: 'a', replaces: 'b', kind: 'readOnly' });
        const bare = apiKeyRotationSchema.parse({ id: 'k' });
        expect(bare.replacedBy).toBeUndefined();
        expect(apiKeyRotationSchema.parse({ replacedBy: null, kind: 3 }).replacedBy).toBeUndefined();
    });
});
