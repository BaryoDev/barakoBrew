'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api, paginatedSchema, parseResponse } from '@/lib/api';
import type { Tone } from '@/components/patterns/status-badge';
import { useCurrentTenant } from '@/hooks/use-tenants';

// Mirrors barakoCMS/Features/WorkflowRuns/Endpoints.cs (camelCase over the wire).

/** The value the status filter uses for "do not filter". Not a status the API knows. */
export const ANY_STATUS = 'all';

/**
 * RunStatus on the server. The status filter offers exactly these, and every run read is parsed
 * against them, so a member the server adds or drops fails the read loudly instead of leaving the
 * filter unable to ask for it. smoke/enums.spec.ts cannot hold this one to the server: the API
 * publishes the field as a bare string.
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
}

/**
 * What a run read is parsed against. Loose, so a member the API adds (correlationId, for one) still
 * reaches the screen. An action's status stays a string: the screen only compares it, and it is a
 * different enum from the run's.
 */
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
}) satisfies z.ZodType<WorkflowActionAttempt>;

export const workflowRunSchema = z.looseObject({
  id: z.string(),
  workflowDefinitionId: z.string(),
  workflowName: z.string(),
  contentId: z.string(),
  contentType: z.string(),
  triggerEvent: z.string(),
  status: z.enum(RUN_STATUSES),
  createdAt: z.string(),
  completedAt: z.string().nullish(),
  cancelledAt: z.string().nullish(),
  actions: z.array(attemptSchema),
  executor: z.string().nullish(),
  abandonedAt: z.string().nullish(),
  compensation: z.string().nullish(),
}) satisfies z.ZodType<WorkflowRun>;

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

/**
 * The tenant is the last part of both keys. Switching tenant invalidates every query, and an
 * invalidated query keeps its rows on screen while the refetch runs, so without it the first
 * tenant's runs would sit in the list until the second tenant's arrived. Under a key the new
 * tenant has never used there is nothing to keep. It goes last so the prefixes the retry hook
 * invalidates on still find it.
 */
export function useWorkflowRuns(query: WorkflowRunsQuery) {
  const params = runListParams(query);
  const tenant = useCurrentTenant();

  return useQuery({
    queryKey: ['workflow-runs', params, tenant],
    queryFn: async () => {
      const response = await api.get<unknown>('/api/workflow-runs', { params });
      return parseResponse(paginatedSchema(workflowRunSchema), response.data, 'GET /api/workflow-runs');
    },
  });
}

export function useWorkflowRun(id: string | null) {
  const tenant = useCurrentTenant();

  return useQuery({
    queryKey: ['workflow-run', id, tenant],
    queryFn: async () => {
      const response = await api.get<unknown>(`/api/workflow-runs/${id}`);
      return parseResponse(workflowRunSchema, response.data, 'GET /api/workflow-runs/{id}');
    },
    enabled: !!id,
  });
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
    mutationFn: async (input: { runId: string; ordinal: number }) => {
      await api.post(`/api/workflow-runs/${input.runId}/actions/${input.ordinal}/retry`, {});
    },
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ['workflow-run', input.runId] });
      void queryClient.invalidateQueries({ queryKey: ['workflow-runs'] });
    },
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
    mutationFn: async (runId: string) => {
      await api.post(`/api/workflow-runs/${encodeURIComponent(runId)}/cancel`, {});
    },
    onSuccess: (_result, runId) => {
      void queryClient.invalidateQueries({ queryKey: ['workflow-run', runId] });
      void queryClient.invalidateQueries({ queryKey: ['workflow-runs'] });
    },
  });
}
