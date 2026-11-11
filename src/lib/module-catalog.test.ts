import { describe, it, expect } from 'vitest';
import { FIRST_PARTY, withFirstParty } from './module-catalog';
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

describe('first-party catalog', () => {
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
        const all = withFirstParty([m('files', { package: 'barakocms.files' })]);
        expect(all.filter((x) => x.name.toLowerCase() === 'files')).toHaveLength(1);
    });

    it('keeps a module the catalog does not know, and fills nothing into it', () => {
        const all = withFirstParty([m('Community.Thing', { description: 'Mine.' })]);
        const mine = all.find((x) => x.name === 'Community.Thing')!;
        expect(mine.category).toBeUndefined();
        expect(mine.description).toBe('Mine.');
        expect(all).toHaveLength(17);
    });

    it('lets the API category win over the catalog one', () => {
        const all = withFirstParty([m('Files', { category: 'Custom' })]);
        expect(all.find((x) => x.name === 'Files')!.category).toBe('Custom');
    });

    it('counts categories in the design order with Other last', () => {
        const counts = categoryCounts([m('Zed'), m('Pages'), m('Accounting'), m('Mystery', { category: 'Beta' })]);
        expect(counts.map((c) => c.category)).toEqual(['Content', 'Domain', 'Beta', 'Other']);
    });
});
