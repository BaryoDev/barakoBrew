import { describe, expect, it } from 'vitest';
import {
    buildForest,
    keyboardTarget,
    pathOf,
    planMove,
    readTree,
    redirectOffers,
    withField,
    type PageForest,
} from './page-tree';
import type { PageTreeItem } from '@/types/pages';

function page(id: string, slug: string, path: string | null, order: number | null, children: PageTreeItem[] = []): PageTreeItem {
    return {
        id,
        title: slug.charAt(0).toUpperCase() + slug.slice(1),
        slug,
        path,
        status: 'Published',
        showInNavigation: true,
        order,
        children,
    };
}

/**
 * home
 * about
 *   team
 *   history
 * contact      (no order, so the API lists it last)
 */
const ITEMS: PageTreeItem[] = [
    page('home', 'home', '/', 1),
    page('about', 'about', '/about', 2, [page('team', 'team', '/about/team', 1), page('history', 'history', '/about/history', 2)]),
    page('contact', 'contact', '/contact', null),
];

const forest = (): PageForest => buildForest(ITEMS);

describe('building the tree from the response', () => {
    it('reads parents and depth from where each page sits', () => {
        const f = forest();

        expect(f.rootIds).toEqual(['home', 'about', 'contact']);
        expect(f.byId.size).toBe(5);
        expect(f.byId.get('team')).toMatchObject({ parentId: 'about', depth: 1, path: '/about/team' });
        expect(f.byId.get('about')?.childIds).toEqual(['team', 'history']);
        expect(f.byId.get('contact')).toMatchObject({ parentId: null, depth: 0, order: null });
    });

    it('keeps the first copy of a repeated id rather than walking it twice', () => {
        const f = buildForest([page('a', 'a', '/a', 1, [page('a', 'a', '/a/a', 1)])]);

        expect(f.byId.size).toBe(1);
        expect(f.byId.get('a')?.childIds).toEqual([]);
    });

    it('reads a supported contract as a tree, with truncated carried through', () => {
        const view = readTree({ contract: 1, truncated: true, items: ITEMS });

        expect(view.kind).toBe('tree');
        expect(view.truncated).toBe(true);
        if (view.kind === 'tree') expect(view.forest.byId.size).toBe(5);
    });
});

describe('a contract this console does not read', () => {
    it('lists every page flat, children included, and says which contract arrived', () => {
        const view = readTree({ contract: 2, truncated: false, items: ITEMS });

        expect(view.kind).toBe('flat');
        expect(view.contract).toBe(2);
        if (view.kind !== 'flat') return;
        expect(view.rows).toHaveLength(5);
        expect(view.rows.map((r) => r.id)).toEqual(['home', 'about', 'team', 'history', 'contact']);
    });

    it('treats a body with no contract as a mismatch, not as contract 1', () => {
        const view = readTree({ items: ITEMS });

        expect(view.kind).toBe('flat');
        expect(view.contract).toBeNull();
    });

    it('lists nothing from a shape it cannot read, rather than throwing', () => {
        const view = readTree({ contract: 9, items: { pages: [] } });

        expect(view).toEqual({ kind: 'flat', rows: [], truncated: false, contract: 9 });
    });
});

describe('the values a move writes', () => {
    it('reorders siblings by renumbering the list it lands in', () => {
        // contact has no order. Dropped before about it has to get one, and about has to move down,
        // or the API would still list contact last.
        const plan = planMove(forest(), 'contact', 'about', 'before');

        expect(plan).not.toBeNull();
        expect(plan!.parentId).toBeNull();
        expect(plan!.writes).toEqual([
            { id: 'contact', order: 2 },
            { id: 'about', order: 3 },
        ]);
    });

    it('writes the new parent on the moved page only, and first', () => {
        const plan = planMove(forest(), 'contact', 'team', 'after');

        expect(plan!.parentId).toBe('about');
        expect(plan!.writes).toEqual([
            { id: 'contact', order: 2, parent: { id: 'about' } },
            { id: 'history', order: 3 },
        ]);
    });

    it('drops inside a page at the end of its children', () => {
        const plan = planMove(forest(), 'home', 'about', 'inside');

        expect(plan!.writes).toEqual([{ id: 'home', order: 3, parent: { id: 'about' } }]);
    });

    it('writes a null parent when a page moves to the top level', () => {
        const plan = planMove(forest(), 'team', 'about', 'after');

        expect(plan!.writes).toHaveLength(2);
        expect(plan!.writes[0]).toEqual({ id: 'team', order: 3, parent: { id: null } });
        expect(plan!.writes[1]).toEqual({ id: 'contact', order: 4 });
    });

    it('refuses a drop inside the page itself or below it', () => {
        expect(planMove(forest(), 'about', 'about', 'inside')).toBeNull();
        expect(planMove(forest(), 'about', 'team', 'inside')).toBeNull();
        expect(planMove(forest(), 'about', 'history', 'after')).toBeNull();
    });

    it('writes nothing for a drop that leaves the order as it was', () => {
        expect(planMove(forest(), 'team', 'history', 'before')).toBeNull();
        expect(planMove(forest(), 'history', 'team', 'after')).toBeNull();
    });
});

describe('keyboard moves', () => {
    it('stand for the same drops a drag makes', () => {
        const f = forest();

        expect(keyboardTarget(f, 'history', 'up')).toEqual({ targetId: 'team', position: 'before' });
        expect(keyboardTarget(f, 'team', 'down')).toEqual({ targetId: 'history', position: 'after' });
        expect(keyboardTarget(f, 'contact', 'indent')).toEqual({ targetId: 'about', position: 'inside' });
        expect(keyboardTarget(f, 'team', 'outdent')).toEqual({ targetId: 'about', position: 'after' });
    });

    it('offer nothing at the edges', () => {
        const f = forest();

        expect(keyboardTarget(f, 'home', 'up')).toBeNull();
        expect(keyboardTarget(f, 'contact', 'down')).toBeNull();
        expect(keyboardTarget(f, 'team', 'indent')).toBeNull();
        expect(keyboardTarget(f, 'about', 'outdent')).toBeNull();
    });
});

describe('path preview', () => {
    it('builds the path the API would, from the slugs down from the root', () => {
        const f = forest();

        expect(pathOf(f, 'team')).toBe('/about/team');
        expect(pathOf(f, 'contact', { parent: { id: 'contact', parentId: 'team' } })).toBe('/about/team/contact');
        expect(pathOf(f, 'team', { parent: { id: 'about', parentId: 'contact' } })).toBe('/contact/about/team');
    });

    it('serves a top-level home slug at / and puts its children under /home', () => {
        const f = forest();

        expect(pathOf(f, 'home')).toBe('/');
        expect(pathOf(f, 'contact', { parent: { id: 'contact', parentId: 'home' } })).toBe('/home/contact');
    });

    it('has no path when a slug is missing or the chain does not reach a root', () => {
        const f = buildForest([
            { ...page('orphan', 'orphan', null, null), children: [page('kid', 'kid', null, null)] },
            { ...page('blank', 'x', null, null), slug: null },
        ]);

        expect(pathOf(f, 'kid')).toBeNull();
        expect(pathOf(f, 'blank')).toBeNull();
    });
});

describe('the redirect offer', () => {
    it('offers one redirect per page a re-parent moves, children included', () => {
        const offers = redirectOffers(forest(), 'about', { parent: { id: 'about', parentId: 'contact' } });

        expect(offers).toEqual([
            { fromPath: '/about', toPath: '/contact/about' },
            { fromPath: '/about/team', toPath: '/contact/about/team' },
            { fromPath: '/about/history', toPath: '/contact/about/history' },
        ]);
    });

    it('offers the same for a slug change', () => {
        const offers = redirectOffers(forest(), 'about', { slug: { id: 'about', slug: 'who-we-are' } });

        expect(offers).toHaveLength(3);
        expect(offers[0]).toEqual({ fromPath: '/about', toPath: '/who-we-are' });
        expect(offers[2]).toEqual({ fromPath: '/about/history', toPath: '/who-we-are/history' });
    });

    it('offers nothing for a reorder, which moves no URL', () => {
        const f = forest();
        const plan = planMove(f, 'history', 'team', 'before');

        expect(plan).not.toBeNull();
        expect(redirectOffers(f, 'history', { parent: { id: 'history', parentId: plan!.parentId } })).toEqual([]);
    });
});

describe('withField', () => {
    it('keeps the casing already stored rather than adding a second key', () => {
        expect(withField({ parentPage: 'a', Title: 'T' }, 'ParentPage', 'b')).toEqual({ parentPage: 'b', Title: 'T' });
    });

    it('removes the field for undefined, which is how a page becomes top level', () => {
        expect(withField({ ParentPage: 'a', Title: 'T' }, 'ParentPage', undefined)).toEqual({ Title: 'T' });
    });
});
