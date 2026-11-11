import { describe, it, expect } from 'vitest';
import { CATEGORY_ORDER, FIRST_PARTY, moduleDisplayName, moduleGlyph, normaliseCategory, withFirstParty } from './module-catalog';
import { categoryCounts, moduleState } from './module-state';
import type { ModuleSummary } from '@/types/modules';

const m = (name: string, extra: Partial<ModuleSummary> = {}): ModuleSummary => ({
    name,
    contractVersion: 1,
    enabled: true,
    schemaState: 'ready',
    schemaChanges: [],
    ...extra,
});

/**
 * Package ids published on nuget.org under the barakocms-module tag, copied from
 * https://azuresearch-usnc.nuget.org/query?q=tags:barakocms-module&take=100 on 2026-11-11
 * (34 hits; only the ones a catalog entry could name are kept here).
 */
const PUBLISHED = [
    'BarakoCMS.Accounting',
    'BarakoCMS.AI',
    'BarakoCMS.Analytics.Umami',
    'BarakoCMS.DeviceTrust',
    'BarakoCMS.Diagnostics',
    'BarakoCMS.Email.Resend',
    'BarakoCMS.Email.Smtp',
    'BarakoCMS.ExternalAuth',
    'BarakoCMS.FeatureFlags',
    'BarakoCMS.Files',
    'BarakoCMS.Files.S3',
    'BarakoCMS.Forms',
    'BarakoCMS.Import',
    'BarakoCMS.Pages',
    'BarakoCMS.Portability',
    'BarakoCMS.Pwa',
];

describe('first-party catalog', () => {
    it('files every module under one of the core ModuleCategory constants', () => {
        expect(CATEGORY_ORDER).toEqual(['Content', 'Comms', 'Access', 'Platform', 'Insight', 'Business']);
        for (const e of FIRST_PARTY) expect(CATEGORY_ORDER, e.name).toContain(e.category);
    });

    it('uses the category each module sets in the core source', () => {
        const by = Object.fromEntries(FIRST_PARTY.map((e) => [e.name, e.category]));
        expect(by).toMatchObject({
            Files: 'Content', 'Files.S3': 'Platform', Portability: 'Platform', 'Email.Smtp': 'Comms',
            ExternalAuth: 'Access', DeviceTrust: 'Access', Pwa: 'Platform', AI: 'Insight', Accounting: 'Business',
        });
    });

    it('compares categories ignoring case and shows them in the constants casing', () => {
        expect(normaliseCategory('platform')).toBe('Platform');
        expect(normaliseCategory(' COMMS ')).toBe('Comms');
        expect(normaliseCategory('Beta')).toBe('Beta');
        expect(normaliseCategory('')).toBeUndefined();
        const all = withFirstParty([m('Files', { category: 'ACCESS' })]);
        expect(all.find((x) => x.name === 'Files')!.category).toBe('Access');
    });

    it('names only packages published on nuget.org under the module tag', () => {
        expect(FIRST_PARTY.length).toBeGreaterThan(0);
        for (const e of FIRST_PARTY) expect(PUBLISHED, e.package).toContain(e.package);
    });

    it('has the 16 modules the design shows', () => {
        expect(FIRST_PARTY).toHaveLength(16);
    });

    it('with 8 of the 16 listed, the other 8 are not installed', () => {
        const listed = FIRST_PARTY.slice(0, 8).map((e) => m(e.name));
        const all = withFirstParty(listed);
        expect(all).toHaveLength(16);
        expect(all.filter((x) => moduleState(x) === 'not-installed')).toHaveLength(8);
        expect(all.filter((x) => moduleState(x) === 'enabled')).toHaveLength(8);
    });

    it('does not add a second card for a module listed under its package id casing', () => {
        const all = withFirstParty([m('files', { packageId: 'barakocms.files' })]);
        expect(all.filter((x) => x.name.toLowerCase() === 'files')).toHaveLength(1);
    });

    it('keeps a module the catalog does not know, and fills nothing into it', () => {
        const all = withFirstParty([m('Community.Thing', { description: 'Mine.' })]);
        const mine = all.find((x) => x.name === 'Community.Thing')!;
        expect(mine.category).toBeUndefined();
        expect(mine.description).toBe('Mine.');
        expect(all).toHaveLength(17);
    });

    it('shows the design display names for first-party modules', () => {
        const names = (n: string) => moduleDisplayName({ name: n });
        expect(names('Files.S3')).toBe('Files · S3');
        expect(names('Email.Resend')).toBe('Email · Resend');
        expect(names('Email.Smtp')).toBe('Email · Smtp');
        expect(names('ExternalAuth')).toBe('External sign-in');
        expect(names('DeviceTrust')).toBe('Device trust');
        expect(names('FeatureFlags')).toBe('Feature flags');
        expect(names('Pwa')).toBe('PWA');
        expect(names('Analytics.Umami')).toBe('Analytics · Umami');
        expect(names('AI')).toBe('AI');
        expect(names('Community.Thing')).toBe('Community.Thing');
    });

    it('takes the glyph from the API when it names a known one, else the catalog, else the cube', () => {
        expect(moduleGlyph({ name: 'Files', glyph: 'flag' })).toBe('flag');
        expect(moduleGlyph({ name: 'Files', glyph: 'not-a-glyph' })).toBe('archive');
        expect(moduleGlyph({ name: 'Files', glyph: null })).toBe('archive');
        expect(moduleGlyph({ name: 'Community.Thing', glyph: 'bug' })).toBe('bug');
        expect(moduleGlyph({ name: 'Community.Thing' })).toBe('cube');
    });

    it('lets the API category win over the catalog one', () => {
        const all = withFirstParty([m('Files', { category: 'Custom' })]);
        expect(all.find((x) => x.name === 'Files')!.category).toBe('Custom');
    });

    it('counts categories in the design order with Other last', () => {
        const counts = categoryCounts([m('Zed'), m('Pages'), m('Accounting'), m('Mystery', { category: 'Beta' })]);
        expect(counts.map((c) => c.category)).toEqual(['Content', 'Business', 'Beta', 'Other']);
    });
});
