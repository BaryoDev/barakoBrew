'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/patterns/status-badge';
import {
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
    IconMore,
    IconPen,
    IconPlus,
} from '@/components/icons';
import { statusMeta } from '@/lib/status-vocabulary';
import {
    keyboardTarget,
    pathOf,
    planMove,
    type DropPosition,
    type KeyMove,
    type PageForest,
    type PageNode,
    type PageOptions,
} from '@/lib/page-tree';
import { cn } from '@/lib/utils';

export function pageName(node: Pick<PageNode, 'title' | 'slug'>): string {
    return node.title || node.slug || 'Untitled page';
}

export interface PageTreeActions {
    forest: PageForest;
    options: PageOptions;
    busy: boolean;
    /** False while the tree is missing pages. */
    canMove: boolean;
    /**
     * The move button to put focus back on once a keyboard move has been saved, and the tree it was
     * pressed in. It is applied once, to the tree read after the move, then cleared through `onFocused`.
     */
    focus: { id: string; move: KeyMove; forest: PageForest } | null;
    onFocused: () => void;
    /** A message per page id, shown on that page's row. */
    errors: Record<string, string>;
    onMove: (id: string, targetId: string, position: DropPosition, via: 'drag' | KeyMove) => void;
    onToggleNavigation: (id: string, value: boolean) => void;
    /** Absent when the page type has no slug field this console can find. */
    onChangeSlug?: (id: string) => void;
}

export function PageTree(props: PageTreeActions) {
    return (
        <ul className="space-y-1.5" aria-label="Page tree">
            {props.forest.rootIds.map((id) => (
                <PageRow key={id} id={id} {...props} />
            ))}
        </ul>
    );
}

/** The top quarter drops before, the bottom quarter after, and the middle inside. */
function positionAt(element: HTMLElement, clientY: number): DropPosition {
    const rect = element.getBoundingClientRect();
    const y = clientY - rect.top;
    if (y < rect.height / 4) return 'before';
    if (y > (rect.height * 3) / 4) return 'after';
    return 'inside';
}

function PageRow({ id, ...actions }: PageTreeActions & { id: string }) {
    const { forest, options, busy, canMove, focus, errors, onMove, onToggleNavigation, onChangeSlug } = actions;
    const node = forest.byId.get(id);
    const switchId = useId();
    const rowRef = useRef<HTMLDivElement>(null);
    const handleRef = useRef<HTMLSpanElement>(null);
    const latest = useRef(actions);
    const [drop, setDrop] = useState<{ position: DropPosition; preview: string | null } | null>(null);
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        latest.current = actions;
    });

    // Registered once per page, not per render: a drag in progress is dropped if its element is
    // unregistered and registered again while the pointer moves. The tree is read through the ref.
    useEffect(() => {
        const element = rowRef.current;
        const dragHandle = handleRef.current;
        if (!element || !dragHandle) return;
        const sourceId = (data: Record<string, unknown>) => (typeof data.pageId === 'string' ? data.pageId : null);
        return combine(
            draggable({
                element,
                dragHandle,
                getInitialData: () => ({ pageId: id }),
                onDragStart: () => setDragging(true),
                onDrop: () => setDragging(false),
            }),
            dropTargetForElements({
                element,
                canDrop: ({ source }) => latest.current.canMove && sourceId(source.data) !== null,
                getData: () => ({ pageId: id }),
                onDrag: ({ source, location }) => {
                    const from = sourceId(source.data);
                    if (!from) return;
                    const position = positionAt(element, location.current.input.clientY);
                    const { forest: tree } = latest.current;
                    const plan = planMove(tree, from, id, position);
                    const parent = plan ? { id: from, parentId: plan.parentId } : null;
                    setDrop(
                        parent ? { position, preview: pathOf(tree, from, { parent }, latest.current.options.homeSlug) } : null,
                    );
                },
                onDragLeave: () => setDrop(null),
                onDrop: ({ source, location }) => {
                    setDrop(null);
                    const from = sourceId(source.data);
                    if (!from || latest.current.busy || !latest.current.canMove) return;
                    latest.current.onMove(from, id, positionAt(element, location.current.input.clientY), 'drag');
                },
            }),
        );
    }, [id]);

    // A move re-renders the tree, and a page that changed parent is a new row, so the button that was
    // pressed is gone. Focus goes back to the same button on the new row, unless it has moved on, and
    // only once: a later refetch must not pull focus back to it.
    const pending = focus?.id === id && focus.forest !== forest ? focus.move : null;
    useEffect(() => {
        if (busy || !pending) return;
        const active = document.activeElement;
        if (!active || active === document.body) {
            rowRef.current?.querySelector<HTMLElement>(`[data-move="${pending}"]`)?.focus();
        }
        latest.current.onFocused();
    }, [busy, pending, forest]);

    if (!node) return null;
    const name = pageName(node);
    const meta = statusMeta(node.status);
    const parent = node.parentId ? forest.byId.get(node.parentId) : undefined;

    const moves: { move: KeyMove; label: string; icon: React.ReactNode }[] = [
        { move: 'up', label: `Move ${name} up`, icon: <IconChevronDown className="size-4 rotate-180" /> },
        { move: 'down', label: `Move ${name} down`, icon: <IconChevronDown className="size-4" /> },
        { move: 'indent', label: `Move ${name} into the page above`, icon: <IconChevronRight className="size-4" /> },
        {
            move: 'outdent',
            label: `Move ${name} out of ${parent ? pageName(parent) : 'its parent'}`,
            icon: <IconChevronLeft className="size-4" />,
        },
    ];

    return (
        <li>
            <div
                ref={rowRef}
                data-page-id={id}
                className={cn(
                    'bg-card relative flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-2 py-1.5',
                    dragging && 'opacity-50',
                    drop?.position === 'inside' && 'ring-primary ring-2',
                )}
            >
                {drop && drop.position !== 'inside' && (
                    <div
                        aria-hidden="true"
                        className={cn('bg-primary absolute inset-x-0 h-0.5', drop.position === 'before' ? '-top-1' : '-bottom-1')}
                    />
                )}
                <span
                    ref={handleRef}
                    aria-hidden="true"
                    title="Drag to move"
                    className="text-muted-foreground cursor-grab px-1"
                >
                    <IconMore className="size-4 rotate-90" />
                </span>
                <div className="min-w-0 flex-1">
                    <Link href={`/content/${id}`} className="block truncate text-sm font-medium hover:underline">
                        {name}
                    </Link>
                    <p className="text-muted-foreground truncate font-mono text-xs">
                        {node.path ?? 'No path: a page above it is missing or has no slug'}
                    </p>
                    {drop && (
                        <p className="text-primary text-xs" data-testid="path-preview">
                            {drop.preview ? `Moves to ${drop.preview}` : 'Moves to a place with no path'}
                        </p>
                    )}
                </div>
                <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                <div className="flex items-center gap-1.5">
                    <Switch
                        id={switchId}
                        size="sm"
                        checked={node.showInNavigation}
                        disabled={busy}
                        onCheckedChange={(value) => onToggleNavigation(id, value)}
                    />
                    <Label htmlFor={switchId} className="text-muted-foreground text-xs font-normal">
                        <span className="sr-only">{name}: </span>In navigation
                    </Label>
                </div>
                <div className="flex items-center">
                    {moves.map(({ move, label, icon }) => {
                        const target = keyboardTarget(forest, id, move);
                        // aria-disabled rather than disabled: a disabled button drops keyboard focus.
                        const off = busy || !canMove || !target;
                        return (
                            <Button
                                key={move}
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                data-move={move}
                                aria-label={label}
                                title={label}
                                aria-disabled={off}
                                className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                                onClick={() => !off && target && onMove(id, target.targetId, target.position, move)}
                            >
                                {icon}
                            </Button>
                        );
                    })}
                    {onChangeSlug && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Change the slug of ${name}`}
                            title="Change slug"
                            disabled={busy}
                            onClick={() => onChangeSlug(id)}
                        >
                            <IconPen className="size-4" />
                        </Button>
                    )}
                    <Button asChild variant="ghost" size="icon-sm">
                        <Link
                            href={`/content/new?type=${encodeURIComponent(options.contentType)}&parent=${encodeURIComponent(id)}&parentField=${encodeURIComponent(options.parent)}`}
                            aria-label={`Add a page under ${name}`}
                            title="Add a page under this one"
                        >
                            <IconPlus className="size-4" />
                        </Link>
                    </Button>
                </div>
                {errors[id] && (
                    <p role="alert" className="text-destructive w-full pl-7 text-xs">
                        {errors[id]}
                    </p>
                )}
            </div>
            {node.childIds.length > 0 && (
                <ul className="mt-1.5 ml-3 space-y-1.5 border-l pl-4">
                    {node.childIds.map((childId) => (
                        <PageRow key={childId} id={childId} {...actions} />
                    ))}
                </ul>
            )}
        </li>
    );
}
