'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/content/field-error';
import { IconArrowLeft, IconArrowRight, IconChevronDown, IconPlus, IconTrash } from '@/components/icons';
import {
    addItem,
    canIndent,
    canMoveDown,
    canMoveUp,
    canOutdent,
    childrenOf,
    indent,
    itemAt,
    labelOf,
    moveDown,
    moveUp,
    opensInNewTab,
    outdent,
    readMenu,
    removeItem,
    updateItem,
    urlOf,
    type MenuItemValue,
    type MenuMove,
    type MenuPath,
} from '@/lib/menu-tree';

type Action = 'up' | 'down' | 'indent' | 'outdent';

function nameOf(item: MenuItemValue) {
    return labelOf(item).trim() || 'untitled item';
}

/**
 * The `Items` field of a `menu` entry, edited as a list rather than as JSON.
 *
 * Every move is a button, so the whole editor works from the keyboard, and focus stays on the item
 * that moved. A stored value the list cannot show without losing part of it is shown as JSON, and
 * the JSON stays one click away for anything the list does not cover.
 */
export function MenuItemsField({
    fieldName,
    displayName,
    label,
    value,
    error,
    onChange,
    json,
}: {
    fieldName: string;
    displayName: string;
    label: ReactNode;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
    json: ReactNode;
}) {
    const items = readMenu(value);
    const [asJson, setAsJson] = useState(false);
    const [focus, setFocus] = useState<{ path: MenuPath; action: Action | 'label' } | { add: true } | null>(null);
    const [announcement, setAnnouncement] = useState('');
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = listRef.current;
        if (!focus || !root) return;
        if ('add' in focus) {
            root.querySelector<HTMLButtonElement>('[data-menu-add]')?.focus();
            return;
        }
        const row = root.querySelector(`[data-menu-path="${focus.path.join('.')}"]`);
        const target =
            row?.querySelector<HTMLElement>(`:scope > [data-menu-row] [data-action="${focus.action}"]:not(:disabled)`) ??
            row?.querySelector<HTMLElement>(':scope > [data-menu-row] [data-action]:not(:disabled)');
        target?.focus();
    }, [focus]);

    const showJson = asJson || items === null;

    const apply = (move: MenuMove, action: Action, message: string) => {
        if (items === null || move.items === items) return;
        onChange(move.items);
        setFocus({ path: move.path, action });
        setAnnouncement(message);
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                {label}
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={showJson && items === null}
                    onClick={() => setAsJson(!showJson)}
                >
                    {showJson ? 'Edit as a list' : 'Edit as JSON'}
                </Button>
            </div>

            {items === null && (
                <p className="text-warning text-xs">
                    This value is not a menu the list can show without losing part of it, so it is shown as
                    JSON.
                </p>
            )}

            {showJson || items === null ? (
                json
            ) : (
                <div ref={listRef} className="space-y-2">
                    {items.length === 0 ? (
                        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
                            No items yet.
                        </p>
                    ) : (
                        <ol aria-label={displayName} className="space-y-2">
                            {items.map((item, i) => (
                                <MenuRow
                                    key={i}
                                    fieldName={fieldName}
                                    items={items}
                                    item={item}
                                    path={[i]}
                                    onChange={onChange}
                                    onMove={apply}
                                    onRemove={(path) => {
                                        onChange(removeItem(items, path));
                                        setFocus({ add: true });
                                        setAnnouncement(`${nameOf(itemAt(items, path))} removed`);
                                    }}
                                />
                            ))}
                        </ol>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-menu-add
                        onClick={() => {
                            const added = addItem(items);
                            onChange(added.items);
                            setFocus(null);
                            setAnnouncement('Item added at the end');
                        }}
                    >
                        <IconPlus className="size-3.5" />
                        Add item
                    </Button>
                </div>
            )}

            <p className="text-muted-foreground text-xs">
                Each item has a label and a link, and can hold one level of submenu items.
            </p>
            <FieldError message={error} />
            <p aria-live="polite" className="sr-only">
                {announcement}
            </p>
        </div>
    );
}

function MenuRow({
    fieldName,
    items,
    item,
    path,
    onChange,
    onMove,
    onRemove,
}: {
    fieldName: string;
    items: MenuItemValue[];
    item: MenuItemValue;
    path: MenuPath;
    onChange: (value: unknown) => void;
    onMove: (move: MenuMove, action: Action, message: string) => void;
    onRemove: (path: MenuPath) => void;
}) {
    const id = `${fieldName}-${path.join('-')}`;
    const name = nameOf(item);
    const parent = path.length === 2 ? nameOf(items[path[0]]) : null;
    const above = path.length === 1 && path[0] > 0 ? nameOf(items[path[0] - 1]) : null;
    const children = childrenOf(item);

    return (
        <li data-menu-path={path.join('.')} className="bg-card rounded-lg border p-3">
            <div data-menu-row className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label htmlFor={`${id}-label`} className="text-xs">
                            Label
                        </Label>
                        <Input
                            id={`${id}-label`}
                            value={labelOf(item)}
                            onChange={(e) => onChange(updateItem(items, path, { label: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor={`${id}-url`} className="text-xs">
                            Link
                        </Label>
                        <Input
                            id={`${id}-url`}
                            value={urlOf(item)}
                            placeholder="/about"
                            onChange={(e) => onChange(updateItem(items, path, { url: e.target.value }))}
                        />
                    </div>
                </div>
                {labelOf(item).trim() === '' && (
                    <p className="text-warning text-xs">An item with no label is left out of the menu.</p>
                )}
                <div className="flex flex-wrap items-center gap-1">
                    <div className="mr-auto flex items-center gap-2">
                        <Checkbox
                            id={`${id}-new-tab`}
                            checked={opensInNewTab(item)}
                            onCheckedChange={(checked) =>
                                onChange(updateItem(items, path, { openInNewTab: checked === true }))
                            }
                        />
                        <Label htmlFor={`${id}-new-tab`} className="text-xs font-normal">
                            Open in a new tab
                        </Label>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        data-action="up"
                        aria-label={`Move ${name} up`}
                        title="Move up"
                        disabled={!canMoveUp(items, path)}
                        onClick={() => onMove(moveUp(items, path), 'up', `${name} moved up`)}
                    >
                        <IconChevronDown className="size-4 rotate-180" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        data-action="down"
                        aria-label={`Move ${name} down`}
                        title="Move down"
                        disabled={!canMoveDown(items, path)}
                        onClick={() => onMove(moveDown(items, path), 'down', `${name} moved down`)}
                    >
                        <IconChevronDown className="size-4" />
                    </Button>
                    {parent === null ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            data-action="indent"
                            aria-label={above ? `Nest ${name} under ${above}` : `Nest ${name} under the item above`}
                            title={
                                children.length > 0
                                    ? 'An item with its own submenu cannot go one level deeper'
                                    : 'Nest under the item above'
                            }
                            disabled={!canIndent(items, path)}
                            onClick={() => onMove(indent(items, path), 'outdent', `${name} is now under ${above}`)}
                        >
                            <IconArrowRight className="size-4" />
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            data-action="outdent"
                            aria-label={`Move ${name} out of ${parent}`}
                            title="Move out of the submenu"
                            disabled={!canOutdent(items, path)}
                            onClick={() => onMove(outdent(items, path), 'indent', `${name} moved out of ${parent}`)}
                        >
                            <IconArrowLeft className="size-4" />
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={children.length > 0 ? `Remove ${name} and its submenu` : `Remove ${name}`}
                        title="Remove"
                        onClick={() => onRemove(path)}
                    >
                        <IconTrash className="size-4" />
                    </Button>
                </div>
            </div>
            {children.length > 0 && (
                <ol aria-label={`${name} submenu`} className="mt-3 ml-4 space-y-2 border-l pl-3">
                    {children.map((child, j) => (
                        <MenuRow
                            key={j}
                            fieldName={fieldName}
                            items={items}
                            item={child}
                            path={[path[0], j]}
                            onChange={onChange}
                            onMove={onMove}
                            onRemove={onRemove}
                        />
                    ))}
                </ol>
            )}
        </li>
    );
}
