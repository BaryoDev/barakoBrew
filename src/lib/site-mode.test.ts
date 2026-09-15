import { describe, expect, it } from 'vitest';
import { buildForest, PAGE_FIELDS } from '@/lib/page-tree';
import {
    holdingPageOptions,
    modeOptions,
    readMode,
    shareLinkExpiry,
    shareLinkStatus,
    shareLinkUrl,
} from '@/lib/site-mode';
import type { FieldDefinition } from '@/types/schema';

const { readTree } = await import('@/lib/page-tree');

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

describe('shareLinkUrl', () => {
    it('puts the key in the fragment after /_share', () => {
        expect(shareLinkUrl('https://example.com', 'abc123')).toBe('https://example.com/_share#abc123');
    });

    it('does not double the slash when the address ends in one', () => {
        expect(shareLinkUrl('https://example.com/club/', 'k')).toBe('https://example.com/club/_share#k');
    });

    it('is null without an absolute address', () => {
        expect(shareLinkUrl('', 'k')).toBeNull();
        expect(shareLinkUrl('/relative', 'k')).toBeNull();
        expect(shareLinkUrl(undefined, 'k')).toBeNull();
    });
});

describe('shareLinkExpiry', () => {
    it('adds the days, and never more than 90', () => {
        expect(shareLinkExpiry(30, NOW)).toBe('2026-10-14T12:00:00.000Z');
        expect(shareLinkExpiry(365, NOW)).toBe('2026-12-13T12:00:00.000Z');
    });
});

describe('site mode', () => {
    it('reads unset as Live and keeps any stored string', () => {
        expect(readMode(undefined)).toBe('Live');
        expect(readMode('')).toBe('Live');
        expect(readMode('Holding')).toBe('Holding');
    });

    it('offers the choice field options when the field has them', () => {
        const field = {
            name: 'Mode',
            displayName: 'Mode',
            type: 'choice',
            isRequired: false,
            options: [
                { value: 'Live', label: 'Open to everyone' },
                { value: 'Holding', label: 'Holding page' },
            ],
        } as FieldDefinition;
        expect(modeOptions(field, 'Holding').map((o) => o.label)).toEqual(['Open to everyone', 'Holding page']);
    });

    it('offers Live and Holding for a plain string field, plus a stored value neither has', () => {
        const field = { name: 'Mode', displayName: 'Mode', type: 'string', isRequired: false } as FieldDefinition;
        expect(modeOptions(field, undefined).map((o) => o.value)).toEqual(['Live', 'Holding']);
        expect(modeOptions(field, 'Private').map((o) => o.value)).toEqual(['Live', 'Holding', 'Private']);
    });
});

describe('holdingPageOptions', () => {
    it('lists pages with a path in tree order, children after their parent', () => {
        const forest = buildForest([
            {
                id: 'about', title: 'About', slug: 'about', path: '/about', status: 'Published', showInNavigation: true, order: 1,
                children: [{ id: 'team', title: 'Team', slug: 'team', path: '/about/team', status: 'Published', showInNavigation: true, order: 1, children: [] }],
            },
            { id: 'soon', title: 'Coming soon', slug: 'soon', path: '/soon', status: 'Published', showInNavigation: false, order: 2, children: [] },
            { id: 'orphan', title: 'Orphan', slug: 'orphan', path: null, status: 'Draft', showInNavigation: false, order: 3, children: [] },
        ]);
        const options = holdingPageOptions({ kind: 'tree', forest, truncated: false, contract: 1, options: PAGE_FIELDS });
        expect(options).toHaveLength(3);
        expect(options.map((o) => o.path)).toEqual(['/about', '/about/team', '/soon']);
        expect(options[0].label).toBe('About (/about)');
        expect(options[1].label).toBe('\u00A0\u00A0Team (/about/team)');
    });

    it('offers only published pages, since the site renders no draft', () => {
        const items = [
            { id: 'live', title: 'Live', slug: 'live', path: '/live', status: 'Published', showInNavigation: true, order: 1, children: [] },
            { id: 'wip', title: 'Work in progress', slug: 'wip', path: '/wip', status: 'Draft', showInNavigation: false, order: 2, children: [] },
        ];

        const tree = holdingPageOptions(readTree({ contract: 1, truncated: false, items }));
        expect(tree).toHaveLength(1);
        expect(tree.map((o) => o.path)).toEqual(['/live']);

        const flat = holdingPageOptions(readTree({ contract: 99, truncated: false, items }));
        expect(flat).toHaveLength(1);
        expect(flat.map((o) => o.path)).toEqual(['/live']);
    });

    it('is empty when the Pages module is not enabled', () => {
        expect(holdingPageOptions({ kind: 'disabled' })).toEqual([]);
    });
});
