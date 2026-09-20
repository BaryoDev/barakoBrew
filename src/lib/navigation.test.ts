import { describe, it, expect } from 'vitest';
import {
    NAV_GROUPS,
    activeNavHref,
    breadcrumbsFor,
    entriesHref,
    singletonHref,
    visibleGroups,
    withModules,
    withSingletons,
} from './navigation';
import { MODULE } from '@/types/modules';

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

    // Gated like the screen: GET /api/files needs upload_files, which is seeded to Admin.
    it('offers Files to Admin and SuperAdmin, and not to a plain user', () => {
        const files = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === '/files');
        expect(files).toBeDefined();
        expect(files!.title).toBe('Files');

        expect(titles(['Admin'])).toContain('Files');
        expect(titles(['SuperAdmin'])).toContain('Files');
        expect(titles(['User'])).not.toContain('Files');
        // Paired with the line above so it cannot pass on an empty nav.
        expect(titles(['User']).length).toBeGreaterThan(0);
    });

    it('titles the files crumb rather than showing the raw segment', () => {
        expect(breadcrumbsFor('/files')).toEqual([{ title: 'Files', href: '/files' }]);
    });

    it('lets a screen name its own crumb, for a path that ends in an id', () => {
        // The entry editor is the screen somebody with no interest in the API spends the day on,
        // and its crumb read the uuid out of the path.
        const id = '4f6c2a90-1b2c-4d3e-8f90-a1b2c3d4e5f6';
        const raw = breadcrumbsFor(`/content/${id}`);
        expect(raw).toHaveLength(2);
        expect(raw[1].title).toBe(id);

        const named = breadcrumbsFor(`/content/${id}`, 'Hello world');
        expect(named).toHaveLength(2);
        expect(named[1]).toEqual({ title: 'Hello world', href: `/content/${id}` });
        // The crumbs above the last one are the route, so a title does not touch them.
        expect(named[0]).toEqual({ title: 'Entries', href: '/content' });
    });

    it('points the entries of a type at the one query string the screen reads', () => {
        expect(entriesHref('blogpost')).toBe('/content?type=blogpost');
        expect(entriesHref()).toBe('/content');
        expect(entriesHref('a type')).toBe('/content?type=a%20type');
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

describe('the site type in the rail', () => {
    it('is reached through Site and Theme, not listed again as a single-entry type', () => {
        const types = [
            { name: 'site', displayName: 'Site', isSingleton: true },
            { name: 'footer', displayName: 'Footer', isSingleton: true },
        ];
        const items = withSingletons(visibleGroups(NAV_GROUPS, ['Admin']), types).flatMap((g) => g.items);

        expect(items.filter((i) => i.href === '/content/singleton/footer')).toHaveLength(1);
        expect(items.filter((i) => i.href === '/content/singleton/site')).toHaveLength(0);
        expect(items.map((i) => i.href)).toEqual(expect.arrayContaining(['/site', '/site/theme']));
    });

    it('offers Site and Theme to Admin and SuperAdmin only', () => {
        const hrefs = (roles: string[]) => visibleGroups(NAV_GROUPS, roles).flatMap((g) => g.items.map((i) => i.href));

        expect(hrefs(['Admin'])).toContain('/site/theme');
        expect(hrefs(['SuperAdmin'])).toContain('/site');
        expect(hrefs(['User'])).not.toContain('/site');
    });

    it('marks Theme active on its own screen, not Site as well', () => {
        const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
        expect(activeNavHref(hrefs, '/site/theme')).toBe('/site/theme');
        expect(breadcrumbsFor('/site/theme').map((c) => c.title)).toEqual(['Site', 'Theme']);
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


describe('modules in the rail', () => {
    const ALL = Object.values(MODULE);
    const moduleTitles = (enabled: readonly string[] | undefined) =>
        withModules(visibleGroups(NAV_GROUPS, ['SuperAdmin']), enabled).flatMap((g) =>
            g.items.map((i) => i.title),
        );

    // The control. Every assertion below is about something disappearing, and all of them pass on a
    // rail that shows nothing at all.
    it('keeps every item when the API runs every module', () => {
        const seen = moduleTitles(ALL);
        expect(seen).toEqual(
            visibleGroups(NAV_GROUPS, ['SuperAdmin']).flatMap((g) => g.items.map((i) => i.title)),
        );
        expect(seen).toContain('Accounting');
    });

    it('drops the item for a module the deployment does not run', () => {
        const seen = moduleTitles(ALL.filter((m) => m !== MODULE.accounting));

        expect(seen).not.toContain('Accounting');
        // The rest of the group is still there, so this is one item going rather than the group.
        expect(seen).toContain('Analytics');
        expect(seen).toContain('Files');
    });

    it('keeps an item that no module serves', () => {
        // Connectors, share links and the audit log are core. A deployment with no modules at all
        // still has them, so an empty list must not empty the rail.
        const seen = moduleTitles([]);

        expect(seen).toContain('Overview');
        expect(seen).toContain('Connectors');
        expect(seen).toContain('Audit log');
        expect(seen).not.toContain('Files');
        expect(seen).not.toContain('Accounting');
    });

    it('shows every item while the API has not answered', () => {
        // Undefined is loading, a 403 for a caller who may not read the list, and a failed request.
        // All three keep the rail exactly as it was before this filter existed.
        const railed = withModules(visibleGroups(NAV_GROUPS, ['SuperAdmin']), undefined);
        expect(railed).toEqual(visibleGroups(NAV_GROUPS, ['SuperAdmin']));
        expect(moduleTitles(undefined)).toContain('Accounting');
    });

    it('drops a group whose every item belonged to a module that is gone', () => {
        // The Modules group is nothing but module items, so a deployment running none of them must
        // not render a "Modules" heading with nothing under it.
        const groups = withModules(visibleGroups(NAV_GROUPS, ['SuperAdmin']), []);
        expect(groups.length).toBeGreaterThan(0);
        expect(groups.map((g) => g.label)).not.toContain('Modules');
        for (const g of groups) expect(g.items.length).toBeGreaterThan(0);
    });

    it('names a module for every item in the Modules group', () => {
        const group = NAV_GROUPS.find((g) => g.label === 'Modules');
        expect(group).toBeDefined();
        expect(group!.items.length).toBeGreaterThan(0);
        expect(group!.items.filter((i) => !i.module).map((i) => i.title)).toEqual([]);
    });

    it('gates on names the API could actually report', () => {
        // A module name is a copy of the module's own Name property. A rail item naming something no
        // module registers would simply never appear, which looks like a deployment problem rather
        // than a typo, so the set of names in use is pinned to the set the console knows.
        const named = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.module);
        expect(named.length).toBeGreaterThan(0);
        for (const item of named) expect(ALL).toContain(item.module);
    });
});
