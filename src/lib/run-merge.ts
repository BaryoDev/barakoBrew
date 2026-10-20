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

/** Whether `candidate` is a change `held` does not already show, not a repeat or an older copy. */
export function isNewer(candidate: MergeableRun, held: MergeableRun): boolean {
  const diff = at(candidate.updatedAt) - at(held.updatedAt);
  return diff > 0 || (diff === 0 && candidate.status !== held.status);
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
  /** Counts from a read that carried them. They replace the page's own. */
  statusCounts?: Record<string, number> | null;
  /**
   * Whether the page's counts may be moved by a run on it that changed status. Off while the counts
   * are already known to be wrong, since the page may then hold rows they never counted.
   */
  moveCounts?: boolean;
}

/** Moves one run between statuses. False, and nothing moved, when `from` holds none to give. */
function moveCount(counts: Record<string, number>, from: string, to: string): boolean {
  if (from === to) return true;
  const held = counts[from] ?? 0;
  if (held <= 0) return false;
  counts[from] = held - 1;
  counts[to] = (counts[to] ?? 0) + 1;
  return true;
}

export interface MergeResult<T, P> {
  page: P;
  /** Rows that left the view, so a caller can top up a page that now has a hole. */
  removed: number;
  /**
   * Changed runs that were not on the page. Their old status is not known here, so the counts were
   * not moved for them, and a caller holding counts has to read them again.
   */
  offPage: T[];
  /** A move found its old status already at 0, so the held counts were wrong before this merge. */
  countsOff: boolean;
}

/**
 * Replaces by id, adds what is new to page 1, drops what left the status filter, and keeps the
 * order and the totals honest.
 *
 * - A run already on the page is replaced when the polled copy is as new, and removed when it no
 *   longer has the filtered status. The page and its counts come from the same read, so the row's
 *   status is the one the counts hold it under, and moving it is exact.
 * - A run not on the page is added only on page 1, and only when it sorts inside the page: a run
 *   older than the last row of a full page is an old run that changed, not a new one. Its old
 *   status is unknown (new, or another status off this page), so it never moves a count. It is
 *   returned in `offPage` instead.
 * - Page 2 and later never gain rows. New runs belong to page 1, and adding them here would show a
 *   run twice across a page change.
 */
export function mergeRunPage<T extends MergeableRun, P extends MergeablePage<T>>(
  current: P,
  changed: readonly T[],
  options: MergeOptions = {},
): MergeResult<T, P> {
  const filter = options.status && options.status !== 'all' ? options.status : null;
  const held = new Map(current.items.map((run) => [run.id, run]));
  const oldest = current.items.length > 0 ? current.items[current.items.length - 1] : null;
  const full = current.items.length >= current.pageSize;

  // One copy per run, the newest, so a run listed twice cannot move a count twice.
  const latest = new Map<string, T>();
  for (const run of changed) {
    const seen = latest.get(run.id);
    if (!seen || isAsNew(run, seen)) latest.set(run.id, run);
  }

  let added = 0;
  let removed = 0;
  let countsOff = false;
  const offPage: T[] = [];
  const adjusted: Record<string, number> | null =
    !options.statusCounts && options.moveCounts !== false && current.statusCounts ? { ...current.statusCounts } : null;

  for (const run of latest.values()) {
    const matches = !filter || run.status === filter;
    const existing = held.get(run.id);

    if (existing) {
      if (!isAsNew(run, existing)) continue;
      if (adjusted && !moveCount(adjusted, existing.status, run.status)) countsOff = true;
      if (matches) {
        held.set(run.id, run);
      } else {
        held.delete(run.id);
        removed += 1;
      }
      continue;
    }

    offPage.push(run);
    if (!matches || current.page !== 1) continue;
    if (full && oldest && byCreatedDesc(run, oldest) > 0) continue;
    held.set(run.id, run);
    added += 1;
  }

  const items = [...held.values()].sort(byCreatedDesc).slice(0, current.pageSize);

  const counts = options.statusCounts ?? adjusted ?? current.statusCounts ?? null;
  let totalItems = Math.max(0, current.totalItems + added - removed);
  if (counts) {
    const counted = filter ? counts[filter] : Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (typeof counted === 'number') totalItems = counted;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / current.pageSize));

  return {
    removed,
    offPage,
    countsOff,
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
