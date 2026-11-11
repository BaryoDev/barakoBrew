import { describe, it, expect } from 'vitest';
import { DEFAULT_METHOD_IDS, readMethodIds, tabsFor } from './sign-in-methods';

const registry = {
    password: { id: 'password' },
    'email-code': { id: 'email-code' },
};

describe('tabsFor', () => {
    it('draws two tabs when the server lists password and email-code', () => {
        const tabs = tabsFor(['password', 'email-code'], registry);
        expect(tabs.map((t) => t.id)).toEqual(['password', 'email-code']);
    });

    it('draws no tab for a listed id that has no registered component', () => {
        const tabs = tabsFor(['password', 'email-code', 'scan-qr'], registry);
        expect(tabs).toHaveLength(2);
        expect(tabs.some((t) => t.id === 'scan-qr')).toBe(false);
    });

    it('draws no tab for a registered component the server does not list', () => {
        const tabs = tabsFor(['password'], { ...registry, 'scan-qr': { id: 'scan-qr' } });
        expect(tabs.map((t) => t.id)).toEqual(['password']);
    });

    it('draws a tab for a further id that is both listed and registered, in the server order', () => {
        const tabs = tabsFor(['email-code', 'password', 'scan-qr'], { ...registry, 'scan-qr': { id: 'scan-qr' } });
        expect(tabs.map((t) => t.id)).toEqual(['email-code', 'password', 'scan-qr']);
    });

    it('does not read an id off the object prototype', () => {
        expect(tabsFor(['constructor', 'toString'], registry)).toHaveLength(0);
    });
});

describe('readMethodIds', () => {
    it('reads the ids in order, lower cased, without repeats', () => {
        expect(readMethodIds({ methods: ['password', 'Email-Code', 'password'] })).toEqual(['password', 'email-code']);
    });

    it('keeps a well-formed empty list as empty, not as unreadable', () => {
        expect(readMethodIds({ methods: [] })).toEqual([]);
    });

    it('answers null for a reply that is not the documented shape', () => {
        expect(readMethodIds(null)).toBeNull();
        expect(readMethodIds({})).toBeNull();
        expect(readMethodIds({ methods: 'password' })).toBeNull();
    });

    it('drops entries that are not strings', () => {
        expect(readMethodIds({ methods: ['password', 3, null, ' '] })).toEqual(['password']);
    });
});

it('falls back to the two methods the console always drew', () => {
    expect(DEFAULT_METHOD_IDS).toEqual(['password', 'email-code']);
});
