import { describe, expect, it } from 'vitest';
import {
    addItem,
    canIndent,
    childrenOf,
    indent,
    isMenuItemsField,
    labelOf,
    moveDown,
    moveUp,
    outdent,
    readMenu,
    removeItem,
    updateItem,
    type MenuItemValue,
    type MenuPath,
} from './menu-tree';

/** The shape the API's MenuTests seeds, plus a key this editor does not know about. */
function menu(): MenuItemValue[] {
    return [
        { Label: 'Blog', Url: '/blog', OpenInNewTab: false },
        {
            Label: 'Docs',
            Url: '/docs',
            OpenInNewTab: false,
            Icon: 'book',
            Children: [
                { Label: 'Guide', Url: '/docs/guide' },
                { Label: 'API', Url: '/docs/api', OpenInNewTab: true },
            ],
        },
        { Label: 'About', Url: '/about', OpenInNewTab: false },
    ];
}

function labels(items: MenuItemValue[]): string[] {
    return items.flatMap((item) => [labelOf(item), ...childrenOf(item).map(labelOf)]);
}

/** Every item's keys other than Children, by label, so a move can be checked for changing nothing else. */
function shapes(items: MenuItemValue[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const item of items.flatMap((i) => [i, ...childrenOf(i)])) {
        out[labelOf(item)] = Object.fromEntries(
            Object.entries(item).filter(([key]) => key !== 'Children' && key !== 'children')
        );
    }
    return out;
}

describe('reading a stored menu', () => {
    it('reads nothing stored as an empty menu', () => {
        expect(readMenu(undefined)).toEqual([]);
        expect(readMenu(null)).toEqual([]);
    });

    it('reads PascalCase and camelCase items, which are the two the client accepts', () => {
        expect(readMenu(menu())).toHaveLength(3);
        expect(readMenu([{ label: 'Home', url: '/', children: [{ label: 'Sub', url: '/s' }] }])).toHaveLength(1);
    });

    it('refuses anything it could not write back unchanged', () => {
        expect(readMenu({ Label: 'Home' })).toBeNull();
        expect(readMenu(['Home'])).toBeNull();
        expect(readMenu([{ Url: '/' }])).toBeNull();
        expect(readMenu([{ Label: 1 }])).toBeNull();
        expect(readMenu([{ Label: 'Home', label: 'Home' }])).toBeNull();
        expect(readMenu([{ Label: 'Home', OpenInNewTab: 'yes' }])).toBeNull();
        expect(readMenu([{ Label: 'Home', Children: {} }])).toBeNull();
    });

    it('refuses a third level, since the client drops it and saving would lose it for good', () => {
        const deep = [{ Label: 'A', Children: [{ Label: 'B', Children: [{ Label: 'C' }] }] }];
        expect(readMenu(deep)).toBeNull();
        // An empty list at the second level is not a third level.
        expect(readMenu([{ Label: 'A', Children: [{ Label: 'B', Children: [] }] }])).toHaveLength(1);
    });
});

describe('moving an item up and down', () => {
    it('swaps a top-level item with the one above and reports where it went', () => {
        const moved = moveUp(menu(), [2]);
        expect(labels(moved.items)).toEqual(['Blog', 'About', 'Docs', 'Guide', 'API']);
        expect(moved.path).toEqual([1]);
    });

    it('moves a child within its own submenu only', () => {
        const moved = moveDown(menu(), [1, 0]);
        expect(labels(moved.items)).toEqual(['Blog', 'Docs', 'API', 'Guide', 'About']);
        expect(moved.path).toEqual([1, 1]);
    });

    it('does nothing at either end, and hands back the same array so nothing is saved', () => {
        const items = menu();
        expect(moveUp(items, [0]).items).toBe(items);
        expect(moveDown(items, [2]).items).toBe(items);
        expect(moveUp(items, [1, 0]).items).toBe(items);
        expect(moveDown(items, [1, 1]).items).toBe(items);
    });
});

describe('nesting and un-nesting', () => {
    it('nests a top-level item as the last child of the item above', () => {
        const moved = indent(menu(), [2]);
        expect(moved.items).toHaveLength(2);
        expect(childrenOf(moved.items[1]).map(labelOf)).toEqual(['Guide', 'API', 'About']);
        expect(moved.path).toEqual([1, 2]);
    });

    it('adds the children key in the casing the parent already uses', () => {
        const pascal = indent([{ Label: 'A', Url: '/a' }, { Label: 'B', Url: '/b' }], [1]).items;
        expect(pascal).toEqual([{ Label: 'A', Url: '/a', Children: [{ Label: 'B', Url: '/b' }] }]);

        const camel = indent([{ label: 'A', url: '/a' }, { label: 'B', url: '/b' }], [1]).items;
        expect(camel).toEqual([{ label: 'A', url: '/a', children: [{ label: 'B', url: '/b' }] }]);
    });

    it('moves a child out to sit directly after its parent, leaving its siblings where they were', () => {
        const moved = outdent(menu(), [1, 0]);
        expect(labels(moved.items)).toEqual(['Blog', 'Docs', 'API', 'Guide', 'About']);
        expect(childrenOf(moved.items[1]).map(labelOf)).toEqual(['API']);
        expect(moved.path).toEqual([2]);
    });

    it('keeps an emptied children list rather than deleting the key', () => {
        const once = outdent(menu(), [1, 1]).items;
        const twice = outdent(once, [1, 0]).items;
        expect(twice[1]).toEqual({ Label: 'Docs', Url: '/docs', OpenInNewTab: false, Icon: 'book', Children: [] });
    });

    it('will not make a third level', () => {
        const items = menu();
        // The first item has nothing above it.
        expect(canIndent(items, [0])).toBe(false);
        // Docs has its own submenu, so nesting it under Blog would put Guide a level too deep.
        expect(canIndent(items, [1])).toBe(false);
        expect(indent(items, [1]).items).toBe(items);
        // A child is already as deep as a menu goes.
        expect(canIndent(items, [1, 0])).toBe(false);
        expect(indent(items, [1, 0]).items).toBe(items);
        // Moving out of a submenu from the top level is not a move.
        expect(outdent(items, [0]).items).toBe(items);
    });
});

describe('any sequence of moves', () => {
    it('loses no item, duplicates none, and changes nothing but order and nesting', () => {
        const start = menu();
        const ops = [moveUp, moveDown, indent, outdent];
        let items = start;
        let steps = 0;
        // Deterministic, so a failure reproduces; every op at every path, several rounds over.
        for (let round = 0; round < 6; round++) {
            for (const op of ops) {
                const paths: MenuPath[] = items.flatMap((item, i) => [
                    [i] as MenuPath,
                    ...childrenOf(item).map((_, j) => [i, j] as MenuPath),
                ]);
                const path = paths[(round * 7 + steps) % paths.length];
                items = op(items, path).items;
                steps++;

                expect(labels(items)).toHaveLength(5);
                expect([...labels(items)].sort()).toEqual(['API', 'About', 'Blog', 'Docs', 'Guide']);
                expect(shapes(items)).toEqual(shapes(start));
                expect(readMenu(items)).not.toBeNull();
            }
        }
        expect(steps).toBe(24);
        // And the sequence did move things, or the checks above ran on an untouched menu.
        expect(labels(items)).not.toEqual(labels(start));
    });

    it('never changes the value it was given', () => {
        const items = menu();
        const before = JSON.stringify(items);
        moveUp(items, [2]);
        indent(items, [2]);
        outdent(items, [1, 0]);
        removeItem(items, [1]);
        updateItem(items, [1, 0], { label: 'Changed' });
        expect(JSON.stringify(items)).toBe(before);
    });
});

describe('adding, removing and editing', () => {
    it('adds an item spelled like the ones already there', () => {
        expect(addItem(menu()).items[3]).toEqual({ Label: '', Url: '', OpenInNewTab: false });
        expect(addItem([{ label: 'A' }]).items[1]).toEqual({ label: '', url: '', openInNewTab: false });
        expect(addItem([]).items).toEqual([{ Label: '', Url: '', OpenInNewTab: false }]);
    });

    it('removes a child, or an item with its submenu', () => {
        expect(labels(removeItem(menu(), [1, 0]))).toEqual(['Blog', 'Docs', 'API', 'About']);
        expect(labels(removeItem(menu(), [1]))).toEqual(['Blog', 'About']);
    });

    it('edits through the key the item already has, and adds a missing one in its casing', () => {
        const items = updateItem(menu(), [1, 0], { label: 'Handbook', openInNewTab: true });
        expect(childrenOf(items[1])[0]).toEqual({ Label: 'Handbook', Url: '/docs/guide', OpenInNewTab: true });
    });
});

describe('which field gets the menu editor', () => {
    it('is the Items field of the menu type, and nothing else', () => {
        expect(isMenuItemsField('menu', 'Items')).toBe(true);
        expect(isMenuItemsField('menu', 'Name')).toBe(false);
        expect(isMenuItemsField('article', 'Items')).toBe(false);
        expect(isMenuItemsField(undefined, 'Items')).toBe(false);
    });
});
