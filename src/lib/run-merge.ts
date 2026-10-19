/**
 * Merging what a `changedSince` poll returned into the page already on screen.
 *
 * Kept free of React and of the API client so the rules can be read, and tested, on their own.
 */

export interface MergeableRun {
    id: string;
    status: string;
    createdAt: string;
    updatedAt?: string | null;
}

export interface MergeablePage<T> {
    items: T[];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    statusCounts?: Record<string, number> | null;
}

function at(value: string | null | undefined): number {
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isNaN(parsed) ? -Infinity : parsed;
}

/**
 * Whether `candidate` is at least as new as `held`. The API lags its cursor, so the same run comes
 * back more than once, and a refetch that was already in flight can land after a poll. In both the
 * later write must win, and an equal one replaces it, which changes nothing.
 */
export function isAsNew(candidate: MergeableRun, held: MergeableRun): boolean {
    return at(candidate.updatedAt) >= at(held.updatedAt);
}

/** Newest first, as the list is without `changedSince`. Id breaks a tie so the order is stable. */
function byCreatedDesc(a: MergeableRun, b: MergeableRun): number {
    const diff = at(b.createdAt) - at(a.createdAt);
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface MergeOptions {
    /** The status filter of the view, if any. A run that no longer has it leaves. */
    status?: string | null;
    /** Counts from the poll's response, newer than the page's. Absent keeps the page's own. */
    statusCounts?: Record<string, number> | null;
}

export interface MergeResult<P> {
    page: P;
    /** Rows that left the view, so a caller can top up a page that now has a hole. */
    removed: number;
}

/**
 * Replaces by id, adds what is new to page 1, drops what left the status filter, and keeps the
 * order and the totals honest.
 *
 * - A run already on the page is replaced when the polled copy is as new, and removed when it no
 *   longer has the filtered status.
 * - A run not on the page is added only on page 1, and only when it sorts inside the page: a run
 *   older than the last row of a full page is an old run that changed, not a new one.
 * - Page 2 and later never gain rows. New runs belong to page 1, and adding them here would show a
 *   run twice across a page change.
 */
export function mergeRunPage<T extends MergeableRun, P extends MergeablePage<T>>(
    current: P,
    changed: readonly T[],
    options: MergeOptions = {},
): MergeResult<P> {
    const filter = options.status && options.status !== 'all' ? options.status : null;
    const held = new Map(current.items.map((run) => [run.id, run]));
    const oldest = current.items.length > 0 ? current.items[current.items.length - 1] : null;
    const full = current.items.length >= current.pageSize;

    let added = 0;
    let removed = 0;

    for (const run of changed) {
        const matches = !filter || run.status === filter;
        const existing = held.get(run.id);

        if (existing) {
            if (!isAsNew(run, existing)) continue;
            if (matches) {
                held.set(run.id, run);
            } else {
                held.delete(run.id);
                removed += 1;
            }
            continue;
        }

        if (!matches || current.page !== 1) continue;
        if (full && oldest && byCreatedDesc(run, oldest) > 0) continue;
        held.set(run.id, run);
        added += 1;
    }

    const items = [...held.values()].sort(byCreatedDesc).slice(0, current.pageSize);

    const counts = options.statusCounts ?? current.statusCounts ?? null;
    let totalItems = Math.max(0, current.totalItems + added - removed);
    if (counts) {
        const counted = filter ? counts[filter] : Object.values(counts).reduce((sum, n) => sum + n, 0);
        if (typeof counted === 'number') totalItems = counted;
    }

    const totalPages = Math.max(1, Math.ceil(totalItems / current.pageSize));

    return {
        removed,
        page: {
            ...current,
            items,
            totalItems,
            totalPages,
            hasNextPage: current.page < totalPages,
            ...(counts ? { statusCounts: counts } : {}),
        },
    };
}
