'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { z } from 'zod';
import { api, paginatedSchema, parseResponse } from '@/lib/api';
import { isAsNew, isNewer, mergeRunPage } from '@/lib/run-merge';
import type { Tone } from '@/components/patterns/status-badge';
import { useCurrentTenant } from '@/hooks/use-tenants';

// Mirrors barakoCMS/Features/WorkflowRuns/Endpoints.cs (camelCase over the wire).

const GUID_FORMS = [
  /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i,
  /^\{([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\}$/i,
  /^\(([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\)$/i,
  /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i,
];

/**
 * The canonical id (hyphenated, lowercase) for text the API's Guid.TryParse accepts: with or
 * without hyphens, in braces or parentheses, and with whitespace around it. Null for anything else,
 * which the API would answer with a 400, so it is not sent.
 */
export function parseRunId(value: string): string | null {
  const text = value.trim();
  for (const form of GUID_FORMS) {
    const match = form.exec(text);
    if (match) return match.slice(1).join('-').toLowerCase();
  }
  return null;
}

/** Whether text is shaped like a run id. */
export function isRunId(value: string): boolean {
  return parseRunId(value) !== null;
}

/** The value the status filter uses for "do not filter". Not a status the API knows. */
export const ANY_STATUS = 'all';

/**
 * RunStatus on the server. The status chips offer exactly these. A run read is not parsed against
 * them: a status this console does not know is shown as its own text on a neutral badge, so one
 * new member on the server does not blank the whole list. smoke/enums.spec.ts cannot hold this one
 * to the server: the API publishes the field as a bare string.
 */
export const RUN_STATUSES = ['Pending', 'Running', 'Succeeded', 'Failed', 'PartiallyFailed', 'Cancelled'] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export interface WorkflowActionAttempt {
  ordinal: number;
  actionType: string;
  status: string;
  attempts: number;
  nextAttemptAt?: string | null;
  responseStatus?: number | null;
  /** Why it failed, truncated by the server. Never a response body. */
  error?: string | null;
  /**
   * For a Failed action, whether a retry could fix the failure. The server sends null for any
   * other status and for a failure recorded before it kept this, and an API older than 4.2.0
   * leaves the field out. Read it through `failureKind`, which keeps those apart from false.
   */
  retryable?: boolean | null;
  completedAt?: string | null;
  durationMs?: number | null;
  /** `Halt` or `Continue`. Absent from an API before 4.6. */
  onFailure?: string | null;
  /** Set on a Skipped action: the ordinal of the halting action whose failure skipped it. */
  haltedBy?: number | null;
  /**
   * The outputs the workflow keeps from this action, once it has succeeded. Null otherwise, and
   * absent from an API before contract 8.
   */
  outputs?: Record<string, string> | null;
  /** The undoing of this action once its run is rolled back. Absent from an API before contract 8. */
  compensation?: ActionCompensation | null;
  /**
   * Every try of this action, oldest first, up to 20. Absent from an API before barakoCMS#1164,
   * which sends only the latest try in the fields above.
   */
  history?: AttemptEntry[] | null;
  /** How many older tries were dropped to stay within the cap. Absent before barakoCMS#1164. */
  droppedAttempts?: number | null;
}

/** One try of an action. `outcome` is an AttemptStatus name and `error` is the redacted text. */
export interface AttemptEntry {
  number: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  outcome: string;
  responseStatus?: number | null;
  error?: string | null;
  retryable?: boolean | null;
  durationMs?: number | null;
}

/** One action's compensation. `status` is a CompensationStatus name; NotDeclared is nothing to undo it. */
export interface ActionCompensation {
  actionType?: string | null;
  status: string;
  attempts: number;
  nextAttemptAt?: string | null;
  error?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
}

export interface WorkflowRun {
  id: string;
  workflowDefinitionId: string;
  workflowName: string;
  contentId: string;
  contentType: string;
  triggerEvent: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
  /** Set once someone stopped the run. Absent from an API before 4.6, which cannot cancel. */
  cancelledAt?: string | null;
  actions: WorkflowActionAttempt[];
  /** What runs it. Null for the built-in runner, absent from an API before contract 8. */
  executor?: string | null;
  /** When an operator abandoned the run. Absent from an API before contract 8. */
  abandonedAt?: string | null;
  /**
   * Compensating, Compensated or Incomplete once the run is rolled back, null for a run that never
   * was. Absent from an API before contract 8.
   */
  compensation?: string | null;
  /** When the run last changed. Absent from an API before barakoCMS#1164. */
  updatedAt?: string | null;
}

/**
 * What a run read is parsed against. Loose, so a member the API adds (correlationId, for one) still
 * reaches the screen. An action's status stays a string: the screen only compares it, and it is a
 * different enum from the run's.
 */
const attemptEntrySchema = z.looseObject({
  number: z.number(),
  startedAt: z.string().nullish(),
  finishedAt: z.string().nullish(),
  outcome: z.string(),
  responseStatus: z.number().nullish(),
  error: z.string().nullish(),
  retryable: z.boolean().nullish(),
  durationMs: z.number().nullish(),
}) satisfies z.ZodType<AttemptEntry>;

const attemptSchema = z.looseObject({
  ordinal: z.number(),
  actionType: z.string(),
  status: z.string(),
  attempts: z.number(),
  nextAttemptAt: z.string().nullish(),
  responseStatus: z.number().nullish(),
  error: z.string().nullish(),
  retryable: z.boolean().nullish(),
  completedAt: z.string().nullish(),
  durationMs: z.number().nullish(),
  onFailure: z.string().nullish(),
  haltedBy: z.number().nullish(),
  outputs: z.record(z.string(), z.string()).nullish(),
  compensation: z
    .looseObject({
      actionType: z.string().nullish(),
      status: z.string(),
      attempts: z.number(),
      nextAttemptAt: z.string().nullish(),
      error: z.string().nullish(),
      completedAt: z.string().nullish(),
      durationMs: z.number().nullish(),
    })
    .nullish(),
  history: z.array(attemptEntrySchema).nullish(),
  droppedAttempts: z.number().nullish(),
}) satisfies z.ZodType<WorkflowActionAttempt>;

export const workflowRunSchema = z.looseObject({
  id: z.string(),
  workflowDefinitionId: z.string(),
  workflowName: z.string(),
  contentId: z.string(),
  contentType: z.string(),
  triggerEvent: z.string(),
  status: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullish(),
  cancelledAt: z.string().nullish(),
  actions: z.array(attemptSchema),
  executor: z.string().nullish(),
  abandonedAt: z.string().nullish(),
  compensation: z.string().nullish(),
  updatedAt: z.string().nullish(),
}) satisfies z.ZodType<WorkflowRun>;

/**
 * The list response. The fields after the page arrive with barakoCMS#1164 and are all optional, so
 * an older API still parses and the screen falls back to what it did before.
 */
/**
 * The API names a status in a count the way it names the status itself, and the tests for the API
 * read the keys that way. A key that arrives in another case is read as the status it spells, so a
 * serializer that changed the case of dictionary keys would not zero every chip.
 */
function canonicalCounts(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts)) {
    const known = RUN_STATUSES.find((status) => status.toLowerCase() === key.toLowerCase());
    out[known ?? key] = value;
  }
  return out;
}

function buildListSchema() {
  return paginatedSchema(workflowRunSchema).extend({
    /** Runs per status for the `contentId` filter, whatever the status filter and the page. */
    statusCounts: z.record(z.string(), z.number()).transform(canonicalCounts).nullish(),
    /** Pass back as `changedSince`. Sent with a `changedSince` read, in place of `statusCounts`. */
    cursor: z.string().nullish(),
    /** Succeeded runs that finished before this are removed by the retention sweep. */
    succeededRetainedFrom: z.string().nullish(),
    /** The same for failed, partially failed and cancelled runs. */
    failedRetainedFrom: z.string().nullish(),
  });
}

let listSchema: ReturnType<typeof buildListSchema> | undefined;

/** Built on first use, so importing this module does not need the client's schema helper. */
export function workflowRunListSchema() {
  return (listSchema ??= buildListSchema());
}

export type WorkflowRunList = z.infer<ReturnType<typeof buildListSchema>>;

export interface WorkflowRunsQuery {
  page?: number;
  pageSize?: number;
  /** A RunStatus name, or ANY_STATUS / empty for every status. */
  status?: string;
  contentId?: string;
}

/**
 * The query string for the list endpoint, carrying only the filters that are set.
 *
 * A blank status has to be left out rather than sent through. `GET /api/workflow-runs?status=`
 * answers 400 with the list of valid names, because the endpoint refuses a filter it cannot parse
 * instead of dropping it, so sending the empty filter turns "show me everything" into an error.
 */
export function runListParams(query: WorkflowRunsQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 25,
  };

  const status = query.status?.trim();
  if (status && status !== ANY_STATUS) params.status = status;

  const contentId = query.contentId?.trim();
  if (contentId) params.contentId = contentId;

  return params;
}

/**
 * Whether an operator may retry one action.
 *
 * Failed is the ordinary case. Unknown is a timeout, where the request may well have arrived and
 * only the response was lost, so retrying it is a decision to accept possible duplicate delivery,
 * and it is a decision only a person can make.
 *
 * Everything else is refused here so the button is never offered:
 *
 * - Succeeded would send the action a second time. The idempotency key exists because that hazard
 *   is real, and the endpoint answers 409, so offering the button only produces an error toast.
 * - Running is in flight on some node right now.
 * - Pending is already queued and the runner will pick it up without being asked.
 * - Skipped had its condition evaluated and not met. The run counts it as done.
 */
export function isRetryable(attempt: Pick<WorkflowActionAttempt, 'status'>): boolean {
  return attempt.status === 'Failed' || attempt.status === 'Unknown';
}

/**
 * Whether the run can be cancelled from here: it is still waiting or running, nobody has stopped it
 * yet, and the API is new enough to have the route (it sends `cancelledAt`, null until a cancel).
 */
export function isCancellable(run: Pick<WorkflowRun, 'status' | 'cancelledAt'>): boolean {
  if (!('cancelledAt' in run) || run.cancelledAt) return false;
  return run.status === 'Pending' || run.status === 'Running';
}

/**
 * Whether the run can be abandoned from here: nobody stopped or rolled it back, it did not finish
 * with everything succeeded, and something in it went out and can be undone. The API decides, and
 * answers 409 with its reason, for what this cannot see, such as an action running right now.
 */
export function isAbandonable(
  run: Pick<WorkflowRun, 'status' | 'cancelledAt' | 'compensation' | 'abandonedAt' | 'actions'>,
): boolean {
  if (!('abandonedAt' in run)) return false;
  if (isStopped(run) || isRolledBack(run)) return false;
  if (run.status === 'Succeeded') return false;
  return run.actions.some((action) => action.status === 'Succeeded');
}

/** What each button on a run needs, as barakoCMS gates the endpoint behind it. */
export const RUN_CAPABILITIES = {
  retry: 'retry_workflow_actions',
  abandon: 'retry_workflow_actions',
  cancel: 'manage_workflows',
} as const;

/** The roles that passed these gates before capabilities existed, for an API older than 4.7. */
export const RUN_LEGACY_ROLES = ['Admin'] as const;

/** A stopped run starts nothing again, and the API answers 409 to a retry on one. */
export function isStopped(run: Pick<WorkflowRun, 'status' | 'cancelledAt'>): boolean {
  return run.status === 'Cancelled' || !!run.cancelledAt;
}

/**
 * Whether the run is being rolled back, or was. From contract 8 the API answers 409 to a retry on
 * one, since going forward again would redo what the rollback undoes.
 */
export function isRolledBack(run: Pick<WorkflowRun, 'compensation' | 'abandonedAt'>): boolean {
  return !!run.compensation || !!run.abandonedAt;
}

/** Whether any action of the run may be retried from here, before asking about the action itself. */
export function runAllowsRetry(run: Pick<WorkflowRun, 'status' | 'cancelledAt' | 'compensation' | 'abandonedAt'>): boolean {
  return !isStopped(run) && !isRolledBack(run);
}

export type FailureKind = 'temporary' | 'permanent';

/**
 * Whether a failed action is worth retrying as it stands, or nothing at all when the API did not say.
 *
 * Three answers, not two. Only a boolean counts: a missing or null `retryable` is "not said", and
 * folding it into false would label every failure from an older API permanent and put a question
 * in front of every retry there. Only a Failed action is labelled. Unknown is a timeout with its
 * own badge, and the server clears the field on every other status.
 */
export function failureKind(
  attempt: Pick<WorkflowActionAttempt, 'status' | 'retryable'>
): FailureKind | null {
  if (attempt.status !== 'Failed') return null;
  if (attempt.retryable === true) return 'temporary';
  if (attempt.retryable === false) return 'permanent';
  return null;
}

/**
 * The kind to show against a whole run in the list: permanent if any failed action is, because that
 * is the one a retry will not clear, otherwise temporary if any failed action says so.
 */
export function runFailureKind(run: {
  actions?: Pick<WorkflowActionAttempt, 'status' | 'retryable'>[];
}): FailureKind | null {
  const kinds = (run.actions ?? []).map(failureKind);
  if (kinds.includes('permanent')) return 'permanent';
  return kinds.includes('temporary') ? 'temporary' : null;
}

/** The words and the tint for a failure kind. The word carries the meaning, the tint only repeats it. */
export const FAILURE_KINDS: Record<FailureKind, { label: string; tone: Tone }> = {
  temporary: { label: 'Temporary', tone: 'warning' },
  permanent: { label: 'Permanent', tone: 'destructive' },
};

/**
 * A duration in words, at a precision an operator can act on.
 *
 * Sub-second stays in milliseconds, because the difference between 40 ms and 900 ms is the
 * difference between a local call and a provider having a bad day. Above a minute drops the
 * fraction, because nothing is decided by the tenth of a second in "4m 12s".
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return 'not recorded';
  if (ms < 1000) return `${Math.round(ms)} ms`;

  const seconds = ms / 1000;
  // Guarded on the rounded value, not on the raw milliseconds. 59,950 ms is under a minute but
  // renders as "60.0 s" once toFixed(1) has had it, which is a duration no clock shows.
  if (seconds < 59.95) return `${seconds.toFixed(1)} s`;

  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

/**
 * The badge tint for a run.
 *
 * PartiallyFailed is warning rather than danger, and that is the whole reason the server keeps it as
 * a state: some of the actions went out. Colouring it the same as Failed would tell an operator to
 * retry a run whose first two actions already posted.
 */
export function toneForRunStatus(status: string): Tone {
  switch (status) {
    case 'Succeeded':
      return 'success';
    case 'Failed':
      return 'destructive';
    case 'PartiallyFailed':
      return 'warning';
    case 'Running':
      return 'accent';
    default:
      return 'muted';
  }
}

/** The badge tint for one action. Unknown is warning: it is neither a success nor a proven failure. */
export function toneForAttemptStatus(status: string): Tone {
  switch (status) {
    case 'Succeeded':
      return 'success';
    case 'Failed':
      return 'destructive';
    case 'Unknown':
      return 'warning';
    case 'Running':
      return 'accent';
    default:
      return 'muted';
  }
}

/** How often a visible list asks what changed. */
export const POLL_INTERVAL_MS = 2000;

/** Backing off after an error never waits longer than this. */
export const POLL_MAX_BACKOFF_MS = 60_000;

/**
 * How far behind now the API holds its cursor. A poll can therefore return a run it returned
 * before, which the merge by id absorbs. It does not make polling any faster useful: a change is
 * seen by the next poll after it commits whatever the lag, so the interval above is the floor.
 */
export const API_CURSOR_LAG_MS = 5000;

/** After a page with more behind it, ask again soon instead of waiting a whole interval. */
const CATCH_UP_MS = 250;

/**
 * Without a server clock to read, start this far back from the browser's. A start that is too early
 * costs a few repeats the merge absorbs, and one that is too late skips a change, so skew is
 * covered by being generous.
 */
const CLIENT_CLOCK_MARGIN_MS = 60_000;

const POLL_PAGE_SIZE = 100;

/** The least time between two reads asked for only to put the counts right. */
export const COUNTS_REFRESH_MS = 10_000;

/** Every mutation of a run carries this key, so a poll can tell one is in flight. */
export const RUN_MUTATION_KEY = ['workflow-run-action'] as const;

function statusOf(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

/** A 401 or a 403 will not get better by asking again, so polling stops on either. */
function isAuthRefusal(error: unknown): boolean {
  const status = statusOf(error);
  return status === 401 || status === 403;
}

/** The wait after the n-th error in a row: the interval doubled each time, up to a minute. */
export function backoffDelay(failures: number): number {
  return Math.min(POLL_INTERVAL_MS * 2 ** failures, POLL_MAX_BACKOFF_MS);
}

type RunListCache = WorkflowRunList;

/**
 * What one list remembers between reads. A class, so the hook that owns it only calls methods on it
 * and never assigns to it, and a new key gets a new one, which is what drops the cursor on a tenant
 * switch.
 */
class ListState {
  /** Where polling starts, taken from the list read it follows. */
  since: string | null = null;
  /**
   * Set while the counts on screen are known to miss a change: when a poll found a run whose old
   * status is not on the page. Holds when the newest such change was seen, so only a read that
   * began after it clears it.
   */
  dirtyAt: number | null = null;
  /** When the read that last landed began, so an older one landing later cannot replace it. */
  landedAt = -Infinity;
  /** When polling last asked for a fresh read to fix the counts. */
  refreshedAt = -Infinity;
  /** Why polling is not at its normal pace, or null when it is. Read through `useSyncExternalStore`. */
  private pause: LivePause | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getPause = () => this.pause;

  setPause(next: LivePause | null) {
    if (this.pause?.reason === next?.reason) return;
    this.pause = next;
    for (const listener of this.listeners) listener();
  }

  /** The newest copy of every run a poll returned, for a refetch that was already in flight. */
  readonly polled = new Map<string, WorkflowRun>();
  /** When the copy in `polled` was first seen, by id. */
  private readonly seenAt = new Map<string, number>();

  markDirty(at: number) {
    this.dirtyAt = Math.max(this.dirtyAt ?? -Infinity, at);
  }

  /**
   * Called when a list read that began at `startedAt` lands with the runs in `onPage`. The read's
   * counts are the server's, so they are right for every change made before it began. A change seen
   * after that, of a run the read did not put on the page, may be missing from them. A read that
   * carried no counts has none to be wrong.
   */
  readLanded(startedAt: number, onPage: ReadonlySet<string>, counted: boolean) {
    this.landedAt = startedAt;
    if (this.dirtyAt !== null && startedAt >= this.dirtyAt) this.dirtyAt = null;
    if (!counted) return;
    for (const [id, seen] of this.seenAt) {
      if (seen > startedAt && !onPage.has(id)) this.markDirty(seen);
    }
  }

  /** A cursor the API sent wins over a time worked out from a clock. */
  startAt(moment: Date, cursor?: string | null) {
    this.since ??= cursor || moment.toISOString();
  }

  /** Keeps the copy of a run when it is a change the held copy does not show. */
  remember(run: WorkflowRun, seenAt: number) {
    const held = this.polled.get(run.id);
    if (held && !isNewer(run, held)) return;
    this.polled.delete(run.id);
    this.polled.set(run.id, run);
    this.seenAt.set(run.id, seenAt);
    while (this.polled.size > POLLED_CAP) {
      const oldest = this.polled.keys().next().value as string;
      this.polled.delete(oldest);
      this.seenAt.delete(oldest);
    }
  }
}

const POLLED_CAP = 300;

/** Polling that is not running at its usual pace. A hidden tab is not one: it resumes by itself. */
export interface LivePause {
  /** `stopped` after a 401 or 403, which asking again will not fix. `backoff` while errors repeat. */
  reason: 'stopped' | 'backoff';
}

/**
 * The runs list, polled while it is open.
 *
 * With `live`, a visible list asks `changedSince` every two seconds and merges what changed into the
 * page by id. The poll leaves the status filter out on purpose: a run that stops matching it is
 * reported only if the poll can see it, and the merge then removes it. When the API sends no cursor
 * (before barakoCMS#1164) the poll reads the current page again instead.
 *
 * The tenant is the last part of the key. Switching tenant invalidates every query, and an
 * invalidated query keeps its rows on screen while the refetch runs, so without it the first
 * tenant's runs would sit in the list until the second tenant's arrived. Under a key the new
 * tenant has never used there is nothing to keep. It goes last so the prefixes the retry hook
 * invalidates on still find it.
 */
export function useWorkflowRuns(query: WorkflowRunsQuery, options: { live?: boolean } = {}) {
  const params = runListParams(query);
  const tenant = useCurrentTenant();
  const queryClient = useQueryClient();
  const queryKey = ['workflow-runs', params, tenant] as const;
  const keyText = JSON.stringify(queryKey);
  const live = options.live ?? false;

  // Per key, so a tenant switch or a new filter drops the cursor and the polled copies with it.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the point of the dependency
  const list = useMemo(() => new ListState(), [keyText]);

  const result = useQuery({
    queryKey,
    queryFn: async () => {
      const started = Date.now();
      const response = await api.get<unknown>('/api/workflow-runs', { params });
      const page = parseResponse(workflowRunListSchema(), response.data, 'GET /api/workflow-runs');

      const header = response.headers?.date;
      const served = typeof header === 'string' ? Date.parse(header) : NaN;
      list.startAt(new Date(Number.isNaN(served) ? started - CLIENT_CLOCK_MARGIN_MS : served - API_CURSOR_LAG_MS), page.cursor);

      // A read that began before the one already shown is older than it. Keep what is shown.
      if (started < list.landedAt) {
        const shown = queryClient.getQueryData<RunListCache>(queryKey);
        if (shown) return shown;
      }

      // The fresh page decides which runs are on it. A polled copy only replaces a row the page
      // already has, when it is newer, so an invalidation after a retry does not put back what the
      // poll just showed, and a run that has since left the page is not brought back. The page and
      // its counts are one read, so moving a count for such a row is exact.
      const onPage = new Set(page.items.map((item) => item.id));
      const overlay = [...list.polled.values()].filter((item) => onPage.has(item.id));
      const merged = overlay.length === 0 ? null : mergeRunPage(page, overlay, { status: params.status as string | undefined });
      list.readLanded(started, onPage, !!page.statusCounts);
      if (merged?.countsOff) list.markDirty(Date.now());
      return merged?.page ?? page;
    },
  });

  const ready = result.dataUpdatedAt > 0;

  useEffect(() => {
    if (!live || !ready) return;
    return startPolling({
      queryClient,
      listKey: queryKey,
      list,
      status: (params.status as string | undefined) ?? null,
      contentId: (params.contentId as string | undefined) ?? null,
      tenant,
    });
    // The key text stands for every part of the key, and `ready` flips once per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, ready, keyText]);

  const pause = useSyncExternalStore(list.subscribe, list.getPause, () => null);

  return { ...result, pause };
}

interface PollingInput {
  queryClient: QueryClient;
  listKey: readonly unknown[];
  list: ListState;
  status: string | null;
  contentId: string | null;
  tenant: string | null;
}

/**
 * Runs the poll loop for one list until the returned function is called. A loop of its own, not a
 * `refetchInterval`, because the interval has to change with errors, wait out a mutation, and
 * restart the moment a hidden tab is shown.
 */
function startPolling(input: PollingInput): () => void {
  const { queryClient, listKey, list, status, contentId, tenant } = input;

  let stopped = false;
  let busy = false;
  let failures = 0;
  let cursor = list.since;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Set the first time a response comes back with no cursor: this API cannot say what changed.
  let rereading = false;

  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

  function schedule(delay: number) {
    clearTimeout(timer);
    if (stopped || hidden()) return;
    timer = setTimeout(() => void tick(), delay);
  }

  /**
   * Reads the page and the open run again. The page's failure is thrown, so a 500 backs polling off
   * and a 403 stops it as they do on the cursor path. The open run's is thrown only when it is a
   * refusal: a run that is gone (a 404) is that screen's to show, not a reason to slow the list.
   */
  async function reread() {
    const [, detail] = await Promise.allSettled([
      queryClient.refetchQueries({ queryKey: listKey, exact: true }, { throwOnError: true }),
      queryClient.refetchQueries({ queryKey: ['workflow-run'], type: 'active' }, { throwOnError: true }),
    ]).then((outcomes) => {
      const [listed, opened] = outcomes;
      if (listed.status === 'rejected') throw listed.reason;
      return [listed, opened] as const;
    });
    if (detail.status === 'rejected' && isAuthRefusal(detail.reason)) throw detail.reason;
  }

  async function tick() {
    if (stopped || busy || hidden()) return;
    if (queryClient.isMutating({ mutationKey: RUN_MUTATION_KEY }) > 0) {
      schedule(POLL_INTERVAL_MS);
      return;
    }

    cursor ??= list.since;
    busy = true;
    let next = POLL_INTERVAL_MS;
    try {
      if (rereading || cursor === null) {
        await reread();
      } else {
        const params: Record<string, string | number> = {
          page: 1,
          pageSize: POLL_PAGE_SIZE,
          changedSince: cursor,
        };
        if (contentId) params.contentId = contentId;

        const response = await api.get<unknown>('/api/workflow-runs', { params });
        if (stopped) return;
        const polled = parseResponse(workflowRunListSchema(), response.data, 'GET /api/workflow-runs?changedSince');

        if (!polled.cursor) {
          rereading = true;
          await reread();
        } else {
          cursor = polled.cursor;
          list.since = polled.cursor;
          if (applyPoll(polled)) next = CATCH_UP_MS;
          refreshCounts();
        }
      }
      failures = 0;
      if (!stopped) list.setPause(null);
    } catch (error) {
      if (stopped) return;
      if (isAuthRefusal(error)) {
        stopped = true;
        list.setPause({ reason: 'stopped' });
        return;
      }
      failures += 1;
      if (failures >= 2) list.setPause({ reason: 'backoff' });
      next = backoffDelay(failures);
    } finally {
      busy = false;
    }
    schedule(next);
  }

  /**
   * Merges one poll into the page and the open run. Returns whether another page is waiting.
   *
   * A poll carries no counts. The merge moves them only for a run on the page, whose old status it
   * knows. Any other change marks them dirty, and `refreshCounts` reads them from the server again.
   */
  function applyPoll(polled: RunListCache): boolean {
    const seenAt = Date.now();
    const known = new Map(list.polled);
    for (const run of polled.items) {
      list.remember(run, seenAt);
      const detailKey = ['workflow-run', run.id, tenant];
      const open = queryClient.getQueryData<WorkflowRun>(detailKey);
      if (open && isAsNew(run, open)) queryClient.setQueryData(detailKey, run);
    }

    let hole = false;
    queryClient.setQueryData<RunListCache>(listKey, (current) => {
      if (!current) return current;
      const merged = mergeRunPage(current, polled.items, { status, moveCounts: list.dirtyAt === null });
      hole = merged.removed > 0 && current.hasNextPage;
      if (current.statusCounts) {
        // A copy seen before is a repeat of the lagging cursor, already in any read since.
        const missed = merged.offPage.some((run) => {
          const seen = known.get(run.id);
          return !seen || isNewer(run, seen);
        });
        if (missed || merged.countsOff) list.markDirty(seenAt);
      }
      return {
        ...merged.page,
        succeededRetainedFrom: polled.succeededRetainedFrom ?? current.succeededRetainedFrom,
        failedRetainedFrom: polled.failedRetainedFrom ?? current.failedRetainedFrom,
      };
    });

    // A run left the filter and more runs follow this page, so the page now ends short. Read it again.
    if (hole) void queryClient.invalidateQueries({ queryKey: listKey, exact: true });
    return polled.hasNextPage;
  }

  /**
   * Reads the list again while its counts are dirty, at most once per `COUNTS_REFRESH_MS` and never
   * while a read of it is in flight. That read clears the flag only if it began after the change.
   */
  function refreshCounts() {
    if (list.dirtyAt === null) return;
    if (queryClient.isFetching({ queryKey: listKey, exact: true }) > 0) return;
    const now = Date.now();
    if (now - list.refreshedAt < COUNTS_REFRESH_MS) return;
    list.refreshedAt = now;
    void queryClient.refetchQueries({ queryKey: listKey, exact: true });
  }

  function onVisibility() {
    if (hidden()) {
      clearTimeout(timer);
      return;
    }
    // Back in view: do not wait out the interval, and forget the errors of the time away.
    failures = 0;
    clearTimeout(timer);
    void tick();
  }

  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  schedule(POLL_INTERVAL_MS);

  return () => {
    stopped = true;
    clearTimeout(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
  };
}

export function useWorkflowRun(id: string | null) {
  const tenant = useCurrentTenant();

  return useQuery({
    queryKey: ['workflow-run', id, tenant],
    queryFn: async () => {
      const response = await api.get<unknown>(`/api/workflow-runs/${encodeURIComponent(id as string)}`);
      return parseResponse(workflowRunSchema, response.data, 'GET /api/workflow-runs/{id}');
    },
    enabled: !!id,
  });
}

/**
 * Refetches the run and the list. After a success so the screen shows a fresh read, and after a
 * refusal (403 or 409) because the refusal means the screen was wrong about the run. Any other
 * failure leaves what the server holds alone.
 */
function refreshAfter(queryClient: QueryClient, runId: string, error?: unknown) {
  if (error !== undefined && statusOf(error) !== 403 && statusOf(error) !== 409) return;
  void queryClient.invalidateQueries({ queryKey: ['workflow-run', runId] });
  void queryClient.invalidateQueries({ queryKey: ['workflow-runs'] });
}

/**
 * Queues one action to be attempted again.
 *
 * The response body is thrown away on purpose. The endpoint returns the run as it stood at the
 * moment of the write, and the runner can claim the attempt a tick later, so painting that body
 * onto the screen would show a Pending action that is already Running. Invalidating instead means
 * what the operator reads after pressing the button came from a fresh read.
 */
export function useRetryAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: RUN_MUTATION_KEY,
    mutationFn: async (input: { runId: string; ordinal: number }) => {
      await api.post(`/api/workflow-runs/${encodeURIComponent(input.runId)}/actions/${input.ordinal}/retry`, {});
    },
    onSuccess: (_result, input) => refreshAfter(queryClient, input.runId),
    onError: (error, input) => refreshAfter(queryClient, input.runId, error),
  });
}

/**
 * Stops a run. Actions not yet started become Cancelled; one already out under a live lease
 * finishes and its outcome is kept. Invalidates rather than painting the response, for the same
 * reason the retry does.
 */
export function useCancelRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: RUN_MUTATION_KEY,
    mutationFn: async (runId: string) => {
      await api.post(`/api/workflow-runs/${encodeURIComponent(runId)}/cancel`, {});
    },
    onSuccess: (_result, runId) => refreshAfter(queryClient, runId),
    onError: (error, runId) => refreshAfter(queryClient, runId, error),
  });
}

/**
 * Abandons a run: the API rolls back what already went out by running the compensations its
 * actions declare, and refuses with a 409 and a reason when the run is not in a state to be
 * abandoned. The response body is thrown away for the same reason the retry's is.
 */
export function useAbandonRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: RUN_MUTATION_KEY,
    mutationFn: async (runId: string) => {
      await api.post(`/api/workflow-runs/${encodeURIComponent(runId)}/abandon`, {});
    },
    onSuccess: (_result, runId) => refreshAfter(queryClient, runId),
    onError: (error, runId) => refreshAfter(queryClient, runId, error),
  });
}
