import { describe, expect, it } from 'vitest';
import {
    FALLBACK_MAX_SHARE_LINK_DAYS,
    defaultShareLinkDays,
    maxShareLinkDays,
    reportedMaxShareLinkDays,
    shareLinkExpiry,
    shareLinkExpiryChoices,
    shareLinkStatus,
} from '@/lib/share-links';
import { siteShareScope } from '@/lib/site-mode';

const NOW = new Date('2026-09-14T12:00:00Z');

describe('shareLinkStatus', () => {
    it('is active before the expiry', () => {
        expect(shareLinkStatus({ expiresAt: '2026-09-15T12:00:00Z', revokedAt: null }, NOW)).toBe('active');
    });

    it('is expired at and after the expiry', () => {
        expect(shareLinkStatus({ expiresAt: '2026-09-14T12:00:00Z', revokedAt: null }, NOW)).toBe('expired');
        expect(shareLinkStatus({ expiresAt: '2026-09-01T00:00:00Z' }, NOW)).toBe('expired');
    });

    it('is revoked when revoked, even once it has also expired', () => {
        expect(shareLinkStatus({ expiresAt: '2026-10-01T00:00:00Z', revokedAt: '2026-09-10T00:00:00Z' }, NOW)).toBe('revoked');
        expect(shareLinkStatus({ expiresAt: '2026-09-01T00:00:00Z', revokedAt: '2026-08-20T00:00:00Z' }, NOW)).toBe('revoked');
    });
});

describe('reportedMaxShareLinkDays', () => {
    it('reads the number the list response carries', () => {
        expect(reportedMaxShareLinkDays({ items: [], maxExpiryDays: 14 })).toBe(14);
        expect(reportedMaxShareLinkDays({ items: [], maxExpiryDays: 365.9 })).toBe(365);
    });

    it('is null for every response that reports nothing usable', () => {
        expect(reportedMaxShareLinkDays({ items: [] })).toBeNull();
        expect(reportedMaxShareLinkDays([])).toBeNull();
        expect(reportedMaxShareLinkDays(null)).toBeNull();
        expect(reportedMaxShareLinkDays(undefined)).toBeNull();
        expect(reportedMaxShareLinkDays({ maxExpiryDays: '30' })).toBeNull();
        expect(reportedMaxShareLinkDays({ maxExpiryDays: 0 })).toBeNull();
        expect(reportedMaxShareLinkDays({ maxExpiryDays: -5 })).toBeNull();
        expect(reportedMaxShareLinkDays({ maxExpiryDays: Number.NaN })).toBeNull();
    });
});

describe('maxShareLinkDays', () => {
    it('prefers what the API reported', () => {
        expect(maxShareLinkDays(14)).toBe(14);
        expect(maxShareLinkDays(365)).toBe(365);
    });

    it('falls back to the 90 days barakoCMS enforces when nothing is reported', () => {
        expect(FALLBACK_MAX_SHARE_LINK_DAYS).toBe(90);
        expect(maxShareLinkDays(null)).toBe(90);
        expect(maxShareLinkDays(undefined)).toBe(90);
    });
});

describe('shareLinkExpiryChoices', () => {
    it('is the shipped list when the maximum is the fallback', () => {
        expect(shareLinkExpiryChoices(90)).toEqual([1, 7, 30, 90]);
    });

    it('drops every choice past a shorter maximum and offers the maximum itself', () => {
        expect(shareLinkExpiryChoices(14)).toEqual([1, 7, 14]);
        expect(shareLinkExpiryChoices(5)).toEqual([1, 5]);
        expect(shareLinkExpiryChoices(1)).toEqual([1]);
    });

    it('reaches past 90 when the maximum does', () => {
        expect(shareLinkExpiryChoices(365)).toEqual([1, 7, 30, 90, 180, 365]);
        expect(shareLinkExpiryChoices(120)).toEqual([1, 7, 30, 90, 120]);
    });

    it('always offers what it starts on, whatever the maximum', () => {
        for (const max of [1, 2, 5, 14, 29, 30, 31, 90, 120, 365]) {
            const choices = shareLinkExpiryChoices(max);
            expect(choices, `choices for a ${max} day maximum`).not.toHaveLength(0);
            expect(choices).toContain(defaultShareLinkDays(max));
        }
    });
});

describe('defaultShareLinkDays', () => {
    it('is 30 when the maximum leaves room', () => {
        expect(defaultShareLinkDays(90)).toBe(30);
        expect(defaultShareLinkDays(365)).toBe(30);
    });

    it('is the maximum when the maximum is shorter', () => {
        expect(defaultShareLinkDays(14)).toBe(14);
        expect(defaultShareLinkDays(1)).toBe(1);
    });
});

describe('shareLinkExpiry', () => {
    it('adds the days', () => {
        expect(shareLinkExpiry(30, 90, NOW)).toBe('2026-10-14T12:00:00.000Z');
    });

    it('never passes the maximum it is given', () => {
        expect(shareLinkExpiry(365, 90, NOW)).toBe('2026-12-13T12:00:00.000Z');
        expect(shareLinkExpiry(90, 14, NOW)).toBe('2026-09-28T12:00:00.000Z');
    });

    it('reaches past 90 days when the maximum allows it', () => {
        expect(shareLinkExpiry(365, 365, NOW)).toBe('2027-09-14T12:00:00.000Z');
    });

    it('is at least a day, and never an invalid date', () => {
        expect(shareLinkExpiry(0, 90, NOW)).toBe('2026-09-15T12:00:00.000Z');
        expect(shareLinkExpiry(-3, 90, NOW)).toBe('2026-09-15T12:00:00.000Z');
        expect(shareLinkExpiry(Number.NaN, 90, NOW)).toBe('2026-10-14T12:00:00.000Z');
    });
});

describe('siteShareScope', () => {
    it('lists, creates and revokes at the site endpoint', () => {
        const scope = siteShareScope('https://example.com');
        expect(scope.path).toBe('/api/site/share-links');
        expect(scope.key).toEqual(['site']);
    });

    it('builds the whole link when the site has a saved address', () => {
        expect(siteShareScope('https://example.com/club/').link('k9')).toEqual({
            value: 'https://example.com/club/_share#k9',
            complete: true,
        });
    });

    it('builds only the tail when it does not, and says so', () => {
        const scope = siteShareScope('');
        expect(scope.link('k9')).toEqual({ value: '/_share#k9', complete: false });
        expect(scope.incompleteNote).toContain('no saved address');
    });
});
