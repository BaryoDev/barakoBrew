/**
 * The page tree as the console works with it: read from `GET /api/pages/tree`, and turned into the
 * field values a move writes.
 *
 * The tree endpoint returns nested items and no parent ids, so a node's parent is read from where it
 * sits. A move is written through the ordinary content update, one entry at a time, and the API
 * refuses a cycle, a tree too deep or a reserved top-level slug inside that write. Nothing here
 * repeats those rules except the one a drag needs to draw itself: a page cannot go inside itself.
 */
import type { PageTreeItem } from '@/types/pages';

/** The contract versions of the Pages bodies this build reads, inclusive. */
export const SUPPORTED_PAGES_CONTRACT: { readonly min: number; readonly max: number } = { min: 1, max: 1 };

/** The type and field names the tree is written through, as `options` in the tree response names them. */
export interface PageOptions {
    contentType: string;
    parent: string;
    showInNavigation: string;
    order: string;
    /** Null when no page is served at `/`. */
    homeSlug: string | null;
}

/**
 * The defaults of `Modules:Pages` on the API, which match the blog blueprint's `page` type. Used
 * where no tree has been read, and for a response without `options`.
 */
export const PAGE_FIELDS: PageOptions = {
    contentType: 'page',
    parent: 'ParentPage',
    showInNavigation: 'ShowInNavigation',
    order: 'NavigationOrder',
    homeSlug: 'home',
};

/**
 * The names from a tree response's `options`. A name that is missing or blank keeps its default, and
 * a response without `options` gets the defaults, which is what an API that sends none uses. A null
 * or empty `homeSlug` inside `options` is the API saying no page is the home page.
 */
export function readOptions(value: unknown): PageOptions {
    if (!isObject(value)) return PAGE_FIELDS;
    const name = (raw: unknown, fallback: string) => (typeof raw === 'string' && raw.trim() !== '' ? raw : fallback);
    return {
        contentType: name(value.contentType, PAGE_FIELDS.contentType),
        parent: name(value.parentField, PAGE_FIELDS.parent),
        showInNavigation: name(value.showInNavigationField, PAGE_FIELDS.showInNavigation),
        order: name(value.orderField, PAGE_FIELDS.order),
        homeSlug: !('homeSlug' in value)
            ? PAGE_FIELDS.homeSlug
            : typeof value.homeSlug === 'string' && value.homeSlug.trim() !== ''
              ? value.homeSlug.trim()
              : null,
    };
}

export interface PageNode {
    id: string;
    title: string | null;
    slug: string | null;
    path: string | null;
    status: string;
    showInNavigation: boolean;
    order: number | null;
    parentId: string | null;
    depth: number;
    childIds: string[];
}

export interface PageForest {
    rootIds: string[];
    byId: Map<string, PageNode>;
}

/** A page as the flat fallback lists it, read from whatever shape arrived. */
export interface FlatPage {
    id: string;
    title: string | null;
    slug: string | null;
    path: string | null;
    status: string | null;
}

export type TreeView =
    | { kind: 'tree'; forest: PageForest; truncated: boolean; contract: number; options: PageOptions }
    | { kind: 'flat'; rows: FlatPage[]; truncated: boolean; contract: number | null };

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const str = (value: unknown) => (typeof value === 'string' ? value : null);

export function buildForest(items: readonly PageTreeItem[]): PageForest {
    const byId = new Map<string, PageNode>();

    const add = (list: readonly PageTreeItem[], parentId: string | null, depth: number): string[] => {
        const ids: string[] = [];
        for (const item of list) {
            // A repeated id would make the walk below loop, and the second copy has nothing to add.
            if (!isObject(item) || typeof item.id !== 'string' || byId.has(item.id)) continue;
            const node: PageNode = {
                id: item.id,
                title: str(item.title),
                slug: str(item.slug),
                path: str(item.path),
                status: str(item.status) ?? 'Draft',
                showInNavigation: item.showInNavigation === true,
                order: typeof item.order === 'number' ? item.order : null,
                parentId,
                depth,
                childIds: [],
            };
            byId.set(node.id, node);
            ids.push(node.id);
            node.childIds = add(Array.isArray(item.children) ? item.children : [], node.id, depth + 1);
        }
        return ids;
    };

    return { rootIds: add(items, null, 0), byId };
}

/** Every page, depth first, for a list that cannot show nesting. Reads as little of the shape as it can. */
function flatRows(items: unknown): FlatPage[] {
    const rows: FlatPage[] = [];
    const seen = new Set<string>();
    const walk = (list: unknown) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
            if (!isObject(item) || typeof item.id !== 'string' || seen.has(item.id)) continue;
            seen.add(item.id);
            rows.push({
                id: item.id,
                title: str(item.title),
                slug: str(item.slug),
                path: str(item.path),
                status: str(item.status),
            });
            walk(item.children);
        }
    };
    walk(items);
    return rows;
}

/**
 * Reads a tree response. A contract this build does not speak is shown as a flat list without
 * moving, rather than as a tree whose writes might mean something else to that API.
 */
export function readTree(body: unknown): TreeView {
    const data = isObject(body) ? body : {};
    const contract = typeof data.contract === 'number' ? data.contract : null;
    const truncated = data.truncated === true;
    const supported =
        contract !== null && contract >= SUPPORTED_PAGES_CONTRACT.min && contract <= SUPPORTED_PAGES_CONTRACT.max;

    if (supported && Array.isArray(data.items)) {
        return {
            kind: 'tree',
            forest: buildForest(data.items as PageTreeItem[]),
            truncated,
            contract,
            options: readOptions(data.options),
        };
    }
    return { kind: 'flat', rows: flatRows(data.items), truncated, contract };
}

export function siblingsOf(forest: PageForest, parentId: string | null): string[] {
    if (parentId === null) return forest.rootIds;
    return forest.byId.get(parentId)?.childIds ?? [];
}

/** Whether `id` is `ancestorId` or sits anywhere below it. */
export function isWithin(forest: PageForest, id: string, ancestorId: string): boolean {
    let current: string | null = id;
    for (let steps = 0; current !== null && steps <= forest.byId.size; steps++) {
        if (current === ancestorId) return true;
        current = forest.byId.get(current)?.parentId ?? null;
    }
    return false;
}

export type DropPosition = 'before' | 'after' | 'inside';

export interface PageWrite {
    id: string;
    order: number;
    /** Present only when the parent changes. `null` is a top-level page. */
    parent?: { id: string | null };
}

export interface MovePlan {
    id: string;
    parentId: string | null;
    /** The moved page first, since that is the write the API checks the chain on. */
    writes: PageWrite[];
}

/**
 * What dropping `id` before, after or inside `targetId` writes.
 *
 * The destination's siblings are renumbered 1, 2, 3 in their new order, and only a page whose order
 * or parent actually changes is written. Numbering the whole list is deliberate: the API sorts a page
 * without an order after those with one, so writing only the moved page's number would not put it
 * where it was dropped. The list it left keeps its numbers, since a gap does not change the order.
 *
 * Null when the drop changes nothing, or would put a page inside itself.
 */
export function planMove(forest: PageForest, id: string, targetId: string, position: DropPosition): MovePlan | null {
    const node = forest.byId.get(id);
    const target = forest.byId.get(targetId);
    if (!node || !target || isWithin(forest, targetId, id)) return null;

    const parentId = position === 'inside' ? target.id : target.parentId;
    const siblings = siblingsOf(forest, parentId).filter((s) => s !== id);
    const at =
        position === 'inside'
            ? siblings.length
            : siblings.indexOf(target.id) + (position === 'after' ? 1 : 0);
    const next = [...siblings.slice(0, at), id, ...siblings.slice(at)];

    const parentChanged = parentId !== node.parentId;
    const current = siblingsOf(forest, node.parentId);
    if (!parentChanged && next.every((s, i) => s === current[i])) return null;

    const writes: PageWrite[] = [];
    next.forEach((siblingId, i) => {
        const order = i + 1;
        if (siblingId === id) {
            writes.unshift({ id, order, ...(parentChanged ? { parent: { id: parentId } } : {}) });
        } else if (forest.byId.get(siblingId)?.order !== order) {
            writes.push({ id: siblingId, order });
        }
    });

    return { id, parentId, writes };
}

export type KeyMove = 'up' | 'down' | 'indent' | 'outdent';

/** The drop a keyboard move stands for, so the buttons and a drag write the same values. */
export function keyboardTarget(
    forest: PageForest,
    id: string,
    move: KeyMove,
): { targetId: string; position: DropPosition } | null {
    const node = forest.byId.get(id);
    if (!node) return null;
    const siblings = siblingsOf(forest, node.parentId);
    const i = siblings.indexOf(id);

    switch (move) {
        case 'up':
            return i > 0 ? { targetId: siblings[i - 1], position: 'before' } : null;
        case 'down':
            return i >= 0 && i < siblings.length - 1 ? { targetId: siblings[i + 1], position: 'after' } : null;
        case 'indent':
            return i > 0 ? { targetId: siblings[i - 1], position: 'inside' } : null;
        case 'outdent':
            return node.parentId ? { targetId: node.parentId, position: 'after' } : null;
    }
}

export interface PathChange {
    /** A new parent for one page. `null` is the top level. */
    parent?: { id: string; parentId: string | null };
    /** A new slug for one page. */
    slug?: { id: string; slug: string };
}

/**
 * A page's path after a change, built the way the API builds it: every slug from the root down,
 * and `/` for a top-level page whose slug is `homeSlug`, compared case-insensitively.
 *
 * Null when the chain has a page with no slug, or does not reach a root, which is when the API sends
 * no path either.
 */
export function pathOf(
    forest: PageForest,
    id: string,
    change: PathChange = {},
    homeSlug: string | null = PAGE_FIELDS.homeSlug,
): string | null {
    const slugs: string[] = [];
    let current: string | null = id;
    for (let steps = 0; current !== null; steps++) {
        const node = forest.byId.get(current);
        if (!node || steps > forest.byId.size) return null;
        const slug = change.slug?.id === current ? change.slug.slug : node.slug;
        if (!slug || !slug.trim()) return null;
        slugs.unshift(slug.trim());
        const parentId: string | null = change.parent?.id === current ? change.parent.parentId : node.parentId;
        // A top-level page the API could not place has no path, and nor does anything below it.
        if (parentId === null && node.parentId === null && node.path === null && change.parent?.id !== current) {
            return null;
        }
        current = parentId;
    }

    if (homeSlug && slugs.length === 1 && slugs[0].toLowerCase() === homeSlug.toLowerCase()) return '/';
    return '/' + slugs.join('/');
}

export interface RedirectOffer {
    fromPath: string;
    toPath: string;
}

/**
 * One redirect per page whose path the change moves: the page itself and every page below it.
 * A redirect is one exact path, so a parent's rule does not cover its children.
 */
export function redirectOffers(
    forest: PageForest,
    id: string,
    change: PathChange,
    homeSlug: string | null = PAGE_FIELDS.homeSlug,
): RedirectOffer[] {
    const offers: RedirectOffer[] = [];
    const visit = (nodeId: string) => {
        const node = forest.byId.get(nodeId);
        if (!node) return;
        const toPath = pathOf(forest, nodeId, change, homeSlug);
        if (node.path && toPath && node.path !== toPath) offers.push({ fromPath: node.path, toPath });
        node.childIds.forEach(visit);
    };
    visit(id);
    return offers;
}

/**
 * The entry's data with one field set, or removed when `value` is undefined.
 *
 * The API matches field names case-insensitively, so an existing key keeps its own casing and a
 * second casing of the same name is never added beside it.
 */
export function withField(data: Record<string, unknown>, name: string, value: unknown): Record<string, unknown> {
    const lower = name.toLowerCase();
    const existing = Object.keys(data).filter((k) => k.toLowerCase() === lower);
    const next = { ...data };
    existing.forEach((k) => delete next[k]);
    if (value !== undefined) next[existing[0] ?? name] = value;
    return next;
}

/** The value of a field, matched the way the API matches it. */
export function fieldValue(data: Record<string, unknown>, name: string): unknown {
    const lower = name.toLowerCase();
    const key = Object.keys(data).find((k) => k.toLowerCase() === lower);
    return key === undefined ? undefined : data[key];
}
