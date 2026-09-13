/**
 * Tree operations for a navigation menu's `Items` value.
 *
 * A menu is a `menu` content type whose `Items` field is `json`. The API stores whatever array it
 * is given and checks nothing beyond "an object or an array", so the shape is set by what reads it:
 * `public.menu()` in @baryodev/barako-client accepts `Label`/`Url`/`OpenInNewTab`/`Children` in
 * PascalCase or camelCase and drops anything below one level of children. The editor keeps to that.
 *
 * Every operation works on the stored objects themselves. An item keeps its own keys, its own
 * casing and any key this editor does not know about; only order and nesting change.
 */

export type MenuItemValue = Record<string, unknown>;

/** Where an item sits: `[i]` for a top-level item, `[i, j]` for child `j` of item `i`. */
export type MenuPath = [number] | [number, number];

/** Children below this depth are dropped by the client that renders a menu, so none are made. */
export const MAX_MENU_DEPTH = 1;

const KEYS = {
    label: ['Label', 'label'],
    url: ['Url', 'url'],
    openInNewTab: ['OpenInNewTab', 'openInNewTab'],
    children: ['Children', 'children'],
} as const;

type Field = keyof typeof KEYS;
type Casing = 'pascal' | 'camel';

function isPlainObject(value: unknown): value is MenuItemValue {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function presentKeys(item: MenuItemValue, field: Field) {
    return KEYS[field].filter((k) => Object.prototype.hasOwnProperty.call(item, k));
}

function casingOf(item: MenuItemValue): Casing {
    return presentKeys(item, 'label')[0] === 'label' ? 'camel' : 'pascal';
}

function keyFor(item: MenuItemValue, field: Field): string {
    return presentKeys(item, field)[0] ?? KEYS[field][casingOf(item) === 'camel' ? 1 : 0];
}

function understoodItem(item: unknown, depth: number): boolean {
    if (!isPlainObject(item)) return false;
    const fields: Field[] = ['label', 'url', 'openInNewTab', 'children'];
    if (fields.some((f) => presentKeys(item, f).length > 1)) return false;

    const label = presentKeys(item, 'label');
    if (label.length === 0 || typeof item[label[0]] !== 'string') return false;

    const url = presentKeys(item, 'url');
    if (url.length === 1 && typeof item[url[0]] !== 'string') return false;

    const newTab = presentKeys(item, 'openInNewTab');
    if (newTab.length === 1 && typeof item[newTab[0]] !== 'boolean') return false;

    const children = presentKeys(item, 'children');
    if (children.length === 0) return true;
    const list = item[children[0]];
    if (!Array.isArray(list)) return false;
    if (list.length > 0 && depth >= MAX_MENU_DEPTH) return false;
    return list.every((child) => understoodItem(child, depth + 1));
}

/**
 * Reads a stored value as a menu the editor can show, or says it cannot.
 *
 * Nothing stored yet reads as an empty menu. Anything else the editor could not write back
 * unchanged (a label that is not text, both `Label` and `label` on one item, a third level) is
 * refused, so the caller shows the JSON instead of an editor that would lose part of it.
 */
export function readMenu(value: unknown): MenuItemValue[] | null {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) return null;
    return value.every((item) => understoodItem(item, 0)) ? (value as MenuItemValue[]) : null;
}

export function childrenOf(item: MenuItemValue): MenuItemValue[] {
    const key = presentKeys(item, 'children')[0];
    const list = key ? item[key] : undefined;
    return Array.isArray(list) ? (list as MenuItemValue[]) : [];
}

export function labelOf(item: MenuItemValue): string {
    return String(item[keyFor(item, 'label')] ?? '');
}

export function urlOf(item: MenuItemValue): string {
    const value = item[keyFor(item, 'url')];
    return typeof value === 'string' ? value : '';
}

export function opensInNewTab(item: MenuItemValue): boolean {
    return item[keyFor(item, 'openInNewTab')] === true;
}

/** Replaces an item's children, keeping the key it already had. */
function withChildren(item: MenuItemValue, children: MenuItemValue[]): MenuItemValue {
    return { ...item, [keyFor(item, 'children')]: children };
}

function replaceAt<T>(list: T[], index: number, value: T): T[] {
    return list.map((x, i) => (i === index ? value : x));
}

function swap<T>(list: T[], a: number, b: number): T[] {
    const next = [...list];
    [next[a], next[b]] = [next[b], next[a]];
    return next;
}

export function canMoveUp(items: MenuItemValue[], path: MenuPath): boolean {
    return path[path.length - 1] > 0;
}

export function canMoveDown(items: MenuItemValue[], path: MenuPath): boolean {
    const siblings = path.length === 1 ? items : childrenOf(items[path[0]]);
    return path[path.length - 1] < siblings.length - 1;
}

/** A top-level item can join the item above it when that keeps the menu within one level. */
export function canIndent(items: MenuItemValue[], path: MenuPath): boolean {
    return path.length === 1 && path[0] > 0 && childrenOf(items[path[0]]).length === 0;
}

export function canOutdent(items: MenuItemValue[], path: MenuPath): boolean {
    return path.length === 2;
}

/** Each operation returns the new items and where the moved item ended up. */
export interface MenuMove {
    items: MenuItemValue[];
    path: MenuPath;
}

export function moveUp(items: MenuItemValue[], path: MenuPath): MenuMove {
    if (!canMoveUp(items, path)) return { items, path };
    if (path.length === 1) return { items: swap(items, path[0], path[0] - 1), path: [path[0] - 1] };
    const [i, j] = path;
    const parent = items[i];
    return {
        items: replaceAt(items, i, withChildren(parent, swap(childrenOf(parent), j, j - 1))),
        path: [i, j - 1],
    };
}

export function moveDown(items: MenuItemValue[], path: MenuPath): MenuMove {
    if (!canMoveDown(items, path)) return { items, path };
    if (path.length === 1) return { items: swap(items, path[0], path[0] + 1), path: [path[0] + 1] };
    const [i, j] = path;
    const parent = items[i];
    return {
        items: replaceAt(items, i, withChildren(parent, swap(childrenOf(parent), j, j + 1))),
        path: [i, j + 1],
    };
}

/** Makes a top-level item the last child of the item above it. */
export function indent(items: MenuItemValue[], path: MenuPath): MenuMove {
    if (!canIndent(items, path)) return { items, path };
    const i = path[0];
    const parent = items[i - 1];
    const siblings = childrenOf(parent);
    const next = [...items];
    next.splice(i - 1, 2, withChildren(parent, [...siblings, items[i]]));
    return { items: next, path: [i - 1, siblings.length] };
}

/** Moves a child out of its parent, to sit directly after the parent. */
export function outdent(items: MenuItemValue[], path: MenuPath): MenuMove {
    if (!canOutdent(items, path)) return { items, path };
    const [i, j] = path as [number, number];
    const parent = items[i];
    const children = childrenOf(parent);
    const next = [...items];
    next.splice(i, 1, withChildren(parent, children.filter((_, k) => k !== j)), children[j]);
    return { items: next, path: [i + 1] };
}

export function removeItem(items: MenuItemValue[], path: MenuPath): MenuItemValue[] {
    if (path.length === 1) return items.filter((_, i) => i !== path[0]);
    const [i, j] = path;
    return replaceAt(items, i, withChildren(items[i], childrenOf(items[i]).filter((_, k) => k !== j)));
}

/** A new top-level item, spelled the way the menu's existing items are. */
export function addItem(items: MenuItemValue[]): MenuMove {
    const camel = items.length > 0 && casingOf(items[0]) === 'camel';
    const item = camel
        ? { label: '', url: '', openInNewTab: false }
        : { Label: '', Url: '', OpenInNewTab: false };
    return { items: [...items, item], path: [items.length] };
}

export function updateItem(
    items: MenuItemValue[],
    path: MenuPath,
    patch: Partial<{ label: string; url: string; openInNewTab: boolean }>
): MenuItemValue[] {
    const apply = (item: MenuItemValue) => {
        const next = { ...item };
        for (const [field, value] of Object.entries(patch) as [Field, unknown][]) {
            next[keyFor(item, field)] = value;
        }
        return next;
    };
    if (path.length === 1) return replaceAt(items, path[0], apply(items[path[0]]));
    const [i, j] = path;
    return replaceAt(items, i, withChildren(items[i], replaceAt(childrenOf(items[i]), j, apply(childrenOf(items[i])[j]))));
}

export function itemAt(items: MenuItemValue[], path: MenuPath): MenuItemValue {
    return path.length === 1 ? items[path[0]] : childrenOf(items[path[0]])[path[1]];
}

/** The convention that turns a json field into the menu editor. Written down in docs/menus.md. */
export function isMenuItemsField(contentType: string | undefined, fieldName: string): boolean {
    return contentType === 'menu' && fieldName === 'Items';
}
