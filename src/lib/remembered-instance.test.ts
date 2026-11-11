import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    REMEMBERED_KEY,
    forgetInstance,
    isForeign,
    parseRemembered,
    readRememberedRaw,
    rememberInstance,
} from './remembered-instance';

const facts = { name: 'Kapé Ana', version: '5.1.0', modules: 16 };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('remembered instance', () => {
    it('knows nothing on a first visit', () => {
        expect(parseRemembered(readRememberedRaw(), 'https://api.cafe.example')).toBeNull();
    });

    it('returns the stored facts for the same host with the time they were seen', () => {
        rememberInstance('https://api.cafe.example', facts, new Date('2026-11-10T09:00:00Z'));
        expect(parseRemembered(readRememberedRaw(), 'https://api.cafe.example')).toEqual({
            origin: 'https://api.cafe.example',
            ...facts,
            seenAt: '2026-11-10T09:00:00.000Z',
        });
    });

    it('does not return another origin\'s facts, and says they are foreign so they can be cleared', () => {
        rememberInstance('https://api.cafe.example', facts);
        const raw = readRememberedRaw();
        expect(parseRemembered(raw, 'https://api.other.example')).toBeNull();
        expect(isForeign(raw, 'https://api.other.example')).toBe(true);
        expect(isForeign(raw, 'https://api.cafe.example')).toBe(false);
    });

    it('is gone after forget', () => {
        rememberInstance('https://api.cafe.example', facts);
        forgetInstance();
        expect(localStorage.getItem(REMEMBERED_KEY)).toBeNull();
        expect(parseRemembered(readRememberedRaw(), 'https://api.cafe.example')).toBeNull();
    });

    it('stores only non-secret facts', () => {
        rememberInstance('https://api.cafe.example', facts);
        expect(Object.keys(JSON.parse(localStorage.getItem(REMEMBERED_KEY)!)).sort()).toEqual([
            'modules',
            'name',
            'origin',
            'seenAt',
            'version',
        ]);
    });

    it('writes nothing when there are no facts', () => {
        rememberInstance('https://api.cafe.example', { name: null, version: null, modules: null });
        expect(localStorage.getItem(REMEMBERED_KEY)).toBeNull();
    });

    it('ignores text that is not a record of ours', () => {
        expect(parseRemembered('not json', 'h')).toBeNull();
        expect(parseRemembered(JSON.stringify({ origin: 'h', name: 3, seenAt: 'x' }), 'h')).toBeNull();
    });

    it('survives storage that throws', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(() => rememberInstance('h', facts)).not.toThrow();
        expect(readRememberedRaw()).toBeNull();
        expect(() => forgetInstance()).not.toThrow();
    });

    it('keys by origin, so another scheme or port is another instance', () => {
        rememberInstance('https://api.cafe.example', facts);
        const raw = readRememberedRaw();
        expect(parseRemembered(raw, 'http://api.cafe.example')).toBeNull();
        expect(parseRemembered(raw, 'https://api.cafe.example:8443')).toBeNull();
        expect(isForeign(raw, 'http://api.cafe.example')).toBe(true);
        expect(parseRemembered(raw, 'https://api.cafe.example')).not.toBeNull();
    });

    it('treats an oversized name or version as no record', () => {
        const base = { origin: 'o', name: 'Ana', version: '5.1.0', modules: 1, seenAt: '2026-11-10T09:00:00Z' };
        expect(parseRemembered(JSON.stringify({ ...base, name: 'x'.repeat(81) }), 'o')).toBeNull();
        expect(parseRemembered(JSON.stringify({ ...base, version: 'v'.repeat(33) }), 'o')).toBeNull();
        expect(parseRemembered(JSON.stringify({ ...base, name: 'x'.repeat(80), version: 'v'.repeat(32) }), 'o')).not.toBeNull();
    });

    it('treats a seenAt that is not a time as no record', () => {
        const base = { origin: 'o', name: 'Ana', version: null, modules: null };
        expect(parseRemembered(JSON.stringify({ ...base, seenAt: 'yesterday' }), 'o')).toBeNull();
    });

    it('never replaces a known value with null', () => {
        rememberInstance('o', facts, new Date('2026-11-10T09:00:00Z'));
        rememberInstance('o', { name: null, version: '5.2.0', modules: null }, new Date('2026-11-10T10:00:00Z'));
        expect(parseRemembered(readRememberedRaw(), 'o')).toMatchObject({ name: 'Kapé Ana', version: '5.2.0', modules: 16 });
    });

    it('moves seenAt forward on a second write', () => {
        rememberInstance('o', facts, new Date('2026-11-10T09:00:00Z'));
        rememberInstance('o', facts, new Date('2026-11-11T09:00:00Z'));
        expect(parseRemembered(readRememberedRaw(), 'o')?.seenAt).toBe('2026-11-11T09:00:00.000Z');
    });
});
