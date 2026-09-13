import { describe, it, expect } from 'vitest';
import {
    NAV_GROUPS,
    activeNavHref,
    breadcrumbsFor,
    singletonHref,
    visibleGroups,
    withSingletons,
} from './navigation';

const count = (roles: string[] | undefined) =>
    visibleGroups(NAV_GROUPS, roles).reduce((n, g) => n + g.items.length, 0);

const titles = (roles: string[] | undefined) =>
    visibleGroups(NAV_GROUPS, roles).flatMap((g) => g.items.map((i) => i.title));

describe('nav visibility', () => {
    // The control. Without it, a filter that hides everything passes every test below.
    it('shows SuperAdmin everything', () => {
        expect(count(['SuperAdmin'])).toBe(
            NAV_GROUPS.reduce((n, g) => n + g.items.length, 0),
        );
    });

    // The regression. A plain user used to see all nineteen destinations.
    it('does not show a plain user the admin destinations', () => {
        const seen = titles(['User']);
        expect(seen).not.toContain('Users');
        expect(seen).not.toContain('Roles');
        expect(seen).not.toContain('Tenants');
        expect(seen).not.toContain('API keys');
        expect(seen).not.toContain('Audit log');
    });

    it('shows fewer to Admin than to SuperAdmin, and fewer again to User', () => {
        expect(count(['Admin'])).toBeLessThan(count(['SuperAdmin']));
        expect(count(['User'])).toBeLessThan(count(['Admin']));
    });

    // The nav offered Editor the content types screen long after #373 removed that grant from
    // GET /api/content-types, so the link was rendered and the API answered 403. Asserted as a
    // role the server has never heard of, because that is what Editor now is: nothing creates it.
    //
    // Two assertions, because they fail on different things and neither covers the other.
    //
    // The derived one reads the gated set out of NAV_GROUPS, so a destination gated later is covered
    // without anybody remembering to add it here. Naming three by hand passed just as happily if
    // Editor was granted Workflows or API keys.
    //
    // The fixed one names Content types, because the derived check cannot see that item losing its
    // roles field: it would drop out of `gated`, become visible to Editor, and the filter below
    // would still be empty because the other gated items are still gated. That is this exact
    // regression, so it gets its own line rather than sharing one.
    //
    // Overview and Health carry no roles and are shown to everyone on purpose, so neither assertion
    // is about them.
    it('routes an unknown role to no gated destination', () => {
        const gated = NAV_GROUPS.flatMap((g) =>
            g.items.filter((i) => i.roles && i.roles.length > 0).map((i) => i.title),
        );

        expect(gated.length).toBeGreaterThan(0);
        expect(gated).toContain('Content types');

        const seen = titles(['Editor']);

        expect(seen.filter((title) => gated.includes(title))).toEqual([]);
        expect(seen).not.toContain('Content types');

        // An empty nav would satisfy both lines above without proving anything about gating.
        expect(seen.length).toBeGreaterThan(0);
    });

    it('gives Accountant the accounting screen and nothing extra', () => {
        const seen = titles(['Accountant']);
        expect(seen).toContain('Accounting');
        expect(seen).not.toContain('Users');
    });

    it('drops a group whose every item was filtered out', () => {
        // Otherwise the sidebar renders an "Access" heading with nothing under it.
        for (const g of visibleGroups(NAV_GROUPS, ['User'])) {
            expect(g.items.length).toBeGreaterThan(0);
        }
    });

    it('treats a signed-out or role-less user as having no roles', () => {
        // Asserted exactly rather than as "fewer than SuperAdmin". The loose form passes on any
        // filter that removes something, including one that removes the wrong things, and it does
        // not say what a role-less caller should still be offered. Overview and Health are the two
        // destinations with no roles declared, so they are the whole expected set.
        expect(titles(undefined)).toEqual(['Overview', 'Health']);
        expect(titles([])).toEqual(['Overview', 'Health']);
    });
});

describe('single-entry types in the rail', () => {
    const TYPES = [
        { name: 'article', displayName: 'Article', isSingleton: false },
        { name: 'sitesettings', displayName: 'Site settings', isSingleton: true },
        { name: 'legacy', displayName: 'Legacy' },
        { name: 'footer', displayName: 'Footer', isSingleton: true },
    ];

    const primaryTitles = (groups: typeof NAV_GROUPS) => groups[0].items.map((i) => i.title);

    it('lists each one directly under Entries, and no other type', () => {
        const titles = primaryTitles(withSingletons(visibleGroups(NAV_GROUPS, ['Admin']), TYPES));
        const at = titles.indexOf('Entries');

        expect(at).toBeGreaterThanOrEqual(0);
        expect(titles.slice(at, at + 4)).toEqual(['Entries', 'Site settings', 'Footer', 'Content types']);
        expect(titles).not.toContain('Article');
        expect(titles).not.toContain('Legacy');
    });

    it('links each one to its edit screen, gated like Entries', () => {
        const items = withSingletons(NAV_GROUPS, TYPES).flatMap((g) => g.items);
        const entries = items.find((i) => i.href === '/content')!;
        const site = items.find((i) => i.title === 'Site settings');

        expect(site).toBeDefined();
        expect(site!.href).toBe('/content/singleton/sitesettings');
        expect(site!.roles).toEqual(entries.roles);
    });

    it('adds nothing when the caller cannot see Entries', () => {
        const groups = visibleGroups(NAV_GROUPS, ['User']);
        expect(groups.flatMap((g) => g.items).length).toBeGreaterThan(0);
        expect(withSingletons(groups, TYPES)).toEqual(groups);
    });

    it('marks only the type as active on its screen, not Entries as well', () => {
        const hrefs = withSingletons(NAV_GROUPS, TYPES).flatMap((g) => g.items.map((i) => i.href));

        expect(activeNavHref(hrefs, singletonHref('sitesettings'))).toBe('/content/singleton/sitesettings');
        expect(activeNavHref(hrefs, '/content/6fb1d0c6-5217-4381-8bc8-4bb45302db0b')).toBe('/content');
        expect(activeNavHref(hrefs, '/')).toBe('/');
    });

    it('gives the edit screen no crumb for a list that does not exist', () => {
        expect(breadcrumbsFor('/content/singleton/sitesettings')).toEqual([
            { title: 'Entries', href: '/content' },
            { title: 'sitesettings', href: '/content/singleton/sitesettings' },
        ]);
        // Every other path keeps one crumb per segment.
        expect(breadcrumbsFor('/content/new')).toHaveLength(2);
    });
});
