'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { StatusBadge, type Tone } from '@/components/patterns/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { IconSearch } from '@/components/icons';
import { cn } from '@/lib/utils';
import { statusTone } from './status-tone';

export type ColumnKind = 'text' | 'number' | 'mono' | 'status' | 'switch';

export interface ModuleColumn {
    key: string;
    label: string;
    kind?: ColumnKind;
    /** How a number or text cell reads. Sorting still uses the raw value. */
    format?: (value: string | number) => string;
}

export interface DrawerField {
    label: string;
    value: string;
    tone?: Tone;
}

export type RowAction =
    | { kind: 'toggle'; label: string }
    | { kind: 'run'; label: string; destructive?: boolean; run: () => Promise<unknown> | void; done: string }
    | { kind: 'remove'; label: string; commit: () => Promise<unknown> | void };

export interface ModuleRow {
    id: string;
    title: string;
    cells: Record<string, string | number>;
    /** The state of the switch column, when the table has one. */
    on?: boolean;
    fields: DrawerField[];
    actions?: RowAction[];
}

export interface StatTile {
    label: string;
    value: string | number;
}

export type TableState = { kind: 'loading' } | { kind: 'message'; text: string };

export interface ModuleBodyProps {
    moduleLabel: string;
    title: string;
    noun: string;
    stats: StatTile[];
    columns: ModuleColumn[];
    rows: ModuleRow[];
    state?: TableState;
    /** The API call a row's drawer shows in its footer. */
    callFor: (row: ModuleRow) => string;
    onToggle?: (row: ModuleRow, next: boolean) => Promise<unknown> | void;
    primary?: ReactNode;
    footer?: ReactNode;
    /** The right column: the Configuration card, and anything else the module screen adds. */
    side?: ReactNode;
}

type SortDir = 'asc' | 'desc';
interface Sort {
    key: string;
    dir: SortDir;
}

/** Off, then ascending, then descending, then off again. */
export function nextSort(current: Sort | null, key: string): Sort | null {
    if (!current || current.key !== key) return { key, dir: 'asc' };
    return current.dir === 'asc' ? { key, dir: 'desc' } : null;
}

const UNDO_MS = 6000;

function cellText(col: ModuleColumn, value: string | number | undefined): string {
    if (value === undefined) return '';
    return col.format ? col.format(value) : String(value);
}

export function ModuleBody(props: ModuleBodyProps) {
    const { stats, side } = props;
    return (
        <>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="module-stats">
                {stats.slice(0, 3).map((s) => (
                    <Card key={s.label} className="gap-1 px-5 py-4">
                        <div className="text-muted-foreground text-[12px] font-bold">{s.label}</div>
                        <div className="font-display text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
                            {s.value}
                        </div>
                    </Card>
                ))}
            </div>
            <div className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
                <ModuleTable {...props} />
                <div className="space-y-4">{side}</div>
            </div>
        </>
    );
}

export function ModuleTable({
    moduleLabel,
    title,
    noun,
    columns,
    rows,
    state,
    callFor,
    onToggle,
    primary,
    footer,
}: ModuleBodyProps) {
    const [sort, setSort] = useState<Sort | null>(null);
    const [filter, setFilter] = useState('');
    const [view, setView] = useState<'list' | 'grid'>('list');
    const [openId, setOpenId] = useState<string | null>(null);
    const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
    const [overrides, setOverrides] = useState<Record<string, boolean>>({});

    const withState = useMemo(
        () => rows.map((r) => (r.id in overrides ? { ...r, on: overrides[r.id], cells: switchCells(r, overrides[r.id]) } : r)),
        [rows, overrides],
    );
    const visible = useMemo(() => {
        const q = filter.trim().toLowerCase();
        let out = withState.filter((r) => !hidden.has(r.id));
        if (q) {
            out = out.filter(
                (r) =>
                    r.title.toLowerCase().includes(q) ||
                    Object.values(r.cells).some((v) => String(v).toLowerCase().includes(q)),
            );
        }
        if (sort) {
            const col = columns.find((c) => c.key === sort.key);
            const sign = sort.dir === 'asc' ? 1 : -1;
            out = [...out].sort((a, b) => {
                const av = a.cells[sort.key] ?? '';
                const bv = b.cells[sort.key] ?? '';
                if (col?.kind === 'number') return (Number(av) - Number(bv)) * sign;
                return String(av).localeCompare(String(bv)) * sign;
            });
        }
        return out;
    }, [withState, hidden, filter, sort, columns]);

    const open = withState.find((r) => r.id === openId) ?? null;

    async function setOn(row: ModuleRow, next: boolean) {
        setOverrides((o) => ({ ...o, [row.id]: next }));
        try {
            await onToggle?.(row, next);
            toast.success(`${row.title} turned ${next ? 'On' : 'Off'}`);
        } catch {
            setOverrides((o) => ({ ...o, [row.id]: !next }));
            toast.error(`Could not turn ${row.title} ${next ? 'On' : 'Off'}`);
        }
    }

    function remove(row: ModuleRow, commit: () => Promise<unknown> | void) {
        let undone = false;
        let settled = false;
        const finish = () => {
            if (undone || settled) return;
            settled = true;
            void Promise.resolve(commit()).then(
                () => setHidden((h) => without(h, row.id)),
                () => {
                    setHidden((h) => without(h, row.id));
                    toast.error(`Could not remove ${row.title}`);
                },
            );
        };
        setHidden((h) => new Set(h).add(row.id));
        setOpenId(null);
        toast(`Removed ${row.title}`, {
            duration: UNDO_MS,
            action: {
                label: 'Undo',
                onClick: () => {
                    undone = true;
                    setHidden((h) => without(h, row.id));
                },
            },
            onAutoClose: finish,
            onDismiss: finish,
        });
    }

    async function runAction(row: ModuleRow, action: RowAction) {
        if (action.kind === 'toggle') return setOn(row, !row.on);
        if (action.kind === 'remove') return remove(row, action.commit);
        try {
            await action.run();
            toast.success(action.done);
        } catch {
            toast.error(`${action.label} failed`);
        }
        setOpenId(null);
    }

    const statusCol = columns.find((c) => c.kind === 'status' || c.kind === 'switch');

    return (
        <Card className="gap-0 overflow-hidden p-0" data-testid="module-table">
            {state ? (
                <div className="border-border border-b px-5 py-3.5">
                    <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
                </div>
            ) : (
            <div className="border-border flex flex-wrap items-center gap-3 border-b px-5 py-3.5">
                <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
                <span className="text-muted-foreground font-mono text-xs tabular-nums" data-testid="row-count">
                    {visible.length}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                        <Input
                            aria-label={`Filter ${noun}`}
                            placeholder="Filter"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="w-44 pl-8"
                        />
                    </div>
                    <SegmentedControl
                        size="sm"
                        aria-label="View"
                        value={view}
                        onValueChange={(v) => setView(v === 'grid' ? 'grid' : 'list')}
                    >
                        <SegmentedControlItem value="list">List</SegmentedControlItem>
                        <SegmentedControlItem value="grid">Grid</SegmentedControlItem>
                    </SegmentedControl>
                    {primary}
                </div>
            </div>
            )}

            {state ? (
                <div className="px-5 py-10 text-center" data-testid="module-table-state">
                    {state.kind === 'loading' ? (
                        <div className="space-y-2">
                            <Skeleton className="h-11 w-full" />
                            <Skeleton className="h-11 w-full" />
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-sm">{state.text}</p>
                    )}
                </div>
            ) : visible.length === 0 ? (
                <p className="text-muted-foreground px-5 py-10 text-center text-sm" data-testid="module-table-empty">
                    {filter.trim() ? `Nothing matches "${filter.trim()}"` : `No ${noun} yet.`}
                </p>
            ) : view === 'list' ? (
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-border border-b">
                            {columns.map((c) => {
                                const active = sort?.key === c.key ? sort : null;
                                return (
                                    <th
                                        key={c.key}
                                        scope="col"
                                        aria-sort={
                                            active ? (active.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                                        }
                                        className={cn('px-5 py-2.5 text-xs font-bold', c.kind === 'number' && 'text-right')}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setSort((s) => nextSort(s, c.key))}
                                            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                                        >
                                            {c.label}
                                            <span aria-hidden className="w-3 text-[9px]">
                                                {active ? (active.dir === 'asc' ? '▲' : '▼') : ''}
                                            </span>
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((r) => (
                            <tr
                                key={r.id}
                                data-testid="module-row"
                                tabIndex={0}
                                onClick={() => setOpenId(r.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.target === e.currentTarget) setOpenId(r.id);
                                }}
                                className="border-border hover:bg-secondary/60 min-h-11 cursor-pointer border-b last:border-b-0"
                            >
                                {columns.map((c) => (
                                    <td
                                        key={c.key}
                                        className={cn(
                                            'px-5 py-3',
                                            c.kind === 'number' && 'text-right font-mono tabular-nums',
                                            c.kind === 'mono' && 'font-mono text-xs',
                                        )}
                                    >
                                        {c.kind === 'switch' ? (
                                            <span className="inline-flex items-center gap-2">
                                                <Switch
                                                    aria-label={`${r.title} ${r.on ? 'On' : 'Off'}`}
                                                    checked={Boolean(r.on)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onCheckedChange={(next) => void setOn(r, next)}
                                                    className="data-[size=default]:h-5 data-[size=default]:w-9"
                                                />
                                                <span className="text-xs font-bold">{r.on ? 'On' : 'Off'}</span>
                                            </span>
                                        ) : c.kind === 'status' ? (
                                            <StatusBadge tone={statusTone(String(r.cells[c.key] ?? ''))}>
                                                {String(r.cells[c.key] ?? '')}
                                            </StatusBadge>
                                        ) : (
                                            cellText(c, r.cells[c.key])
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 p-4" data-testid="module-grid">
                    {visible.map((r) => (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() => setOpenId(r.id)}
                            className="border-border hover:bg-secondary/60 flex h-24 flex-col justify-between rounded-lg border p-3 text-left"
                        >
                            <span className="truncate text-sm font-semibold">{r.title}</span>
                            {statusCol && (
                                <span>
                                    <StatusBadge
                                        tone={statusTone(
                                            statusCol.kind === 'switch' ? (r.on ? 'On' : 'Off') : String(r.cells[statusCol.key] ?? ''),
                                        )}
                                    >
                                        {statusCol.kind === 'switch' ? (r.on ? 'On' : 'Off') : String(r.cells[statusCol.key] ?? '')}
                                    </StatusBadge>
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
            {footer && <div className="border-border border-t px-5 pb-4">{footer}</div>}

            <Sheet open={open !== null} onOpenChange={(o) => !o && setOpenId(null)}>
                <SheetContent
                    className="w-[420px] max-w-full gap-0 sm:max-w-[420px] data-[state=open]:animate-[slidein_280ms_cubic-bezier(0.2,0.8,0.2,1)]!"
                >
                    {open && (
                        <div className="grid h-full grid-rows-[auto_1fr_auto]">
                            <div className="border-border grid gap-0.5 border-b px-5 py-[18px] pr-14">
                                <SheetDescription>
                                    {moduleLabel} / {noun}
                                </SheetDescription>
                                <SheetTitle className="font-display text-2xl font-semibold tracking-[-0.02em]">
                                    {open.title}
                                </SheetTitle>
                            </div>
                            <div className="space-y-5 overflow-y-auto px-5 py-4">
                                <dl className="grid gap-3">
                                    {open.fields.map((f) => (
                                        <div key={f.label} className="grid gap-0.5">
                                            <dt className="text-muted-foreground text-xs font-bold">{f.label}</dt>
                                            <dd className="text-sm break-words">
                                                {f.tone ? <StatusBadge tone={f.tone}>{f.value}</StatusBadge> : f.value}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                                {open.actions && open.actions.length > 0 && (
                                    <div className="grid gap-2">
                                        {open.actions.map((a, i) => (
                                            <Button
                                                key={a.label}
                                                type="button"
                                                variant={i === 0 ? 'default' : 'outline'}
                                                className={cn(
                                                    (a.kind === 'remove' || (a.kind === 'run' && a.destructive)) &&
                                                        'text-destructive',
                                                )}
                                                onClick={() => void runAction(open, a)}
                                            >
                                                {a.label}
                                            </Button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <SheetFooter className="border-border border-t px-5 py-3">
                                <code className="text-muted-foreground font-mono text-xs break-all">{callFor(open)}</code>
                            </SheetFooter>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </Card>
    );
}

function without(set: ReadonlySet<string>, id: string): Set<string> {
    const next = new Set(set);
    next.delete(id);
    return next;
}

/** A switch row's status text follows its switch, so a status cell beside it does not go stale. */
function switchCells(row: ModuleRow, on: boolean): Record<string, string | number> {
    const cells = { ...row.cells };
    for (const k of Object.keys(cells)) if (cells[k] === 'On' || cells[k] === 'Off') cells[k] = on ? 'On' : 'Off';
    return cells;
}
