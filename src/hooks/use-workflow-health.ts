'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import axios from 'axios';
import { api, apiErrorMessage, isNotFound, paginatedSchema, parseResponse } from '@/lib/api';
import { useCurrentTenant } from '@/hooks/use-tenants';

// Mirrors barakoCMS/Features/Workflows/GetWorkflowHealth and RunWorkflow (camelCase over the wire).

/** The capability behind Run now, and the roles that passed the gate before capabilities existed. */
export const RUN_WORKFLOWS_CAPABILITY = 'run_workflows';
export const RUN_WORKFLOWS_LEGACY_ROLES = ['Admin'] as const;

/** Health asks for the same capability the run list does. */
export const VIEW_RUNS_CAPABILITY = 'view_workflow_runs';

const outcomeSchema = z.looseObject({
  runId: z.string(),
  status: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullish(),
});

const healthSchema = z.looseObject({
  workflowId: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  lastOutcomes: z.array(outcomeSchema).nullish().transform((v) => v ?? []),
  successRate: z.number().nullish(),
  finishedRuns: z.number().nullish().transform((v) => v ?? 0),
  averageActionDurationMs: z.number().nullish(),
});

const healthListSchema = paginatedSchema(healthSchema).extend({
  windowDays: z.number(),
  windowFrom: z.string().nullish(),
});

export type WorkflowOutcome = z.infer<typeof outcomeSchema>;
export type WorkflowHealth = z.infer<typeof healthSchema>;

/** Enough workflows in one read that a console with a few dozen never pages. */
const HEALTH_PAGE_SIZE = 100;

/** At most this many pages are read, so a runaway total cannot become a runaway loop. */
const HEALTH_MAX_PAGES = 10;

/**
 * Each workflow's health, by workflow id.
 *
 * `unavailable` is true when the API has no such route (before barakoCMS#1165 it answers 404). The
 * tiles and Run now are hidden then. Any other failure leaves `data` undefined and the tiles
 * empty: a failed read is not a claim that a workflow has no runs.
 *
 * The tenant is part of the key, so another tenant's rates never sit on screen while the new
 * tenant's arrive.
 */
export function useWorkflowHealth(enabled = true) {
  const tenant = useCurrentTenant();

  const query = useQuery({
    queryKey: ['workflow-health', tenant],
    queryFn: async () => {
      try {
        const byId = new Map<string, WorkflowHealth>();
        let windowDays = 0;
        // Every page, up to a bound, so a console with more workflows than one page loses no tile.
        for (let number = 1; number <= HEALTH_MAX_PAGES; number++) {
          const response = await api.get<unknown>('/api/workflows/health', {
            params: { page: number, pageSize: HEALTH_PAGE_SIZE },
          });
          const page = parseResponse(healthListSchema, response.data, 'GET /api/workflows/health');
          windowDays = page.windowDays;
          for (const item of page.items) byId.set(item.workflowId, item);
          if (!page.hasNextPage) break;
        }
        return { available: true as const, windowDays, byId };
      } catch (error) {
        if (isNotFound(error)) return { available: false as const };
        throw error;
      }
    },
    enabled,
    retry: false,
  });

  return {
    ...query,
    unavailable: query.data?.available === false,
    /**
     * Whether Run now is offered: health answered, or failed with anything but a 404. A 500 or a
     * dropped connection says nothing about whether the run route is there, so it does not hide the
     * button. False while the first read is in flight, so the button never flashes and goes.
     */
    offersRun: query.data?.available === true || (query.isError && query.data?.available !== false),
    windowDays: query.data?.available ? query.data.windowDays : undefined,
    healthOf: (workflowId: string | undefined): WorkflowHealth | undefined =>
      query.data?.available && workflowId ? query.data.byId.get(workflowId) : undefined,
  };
}

export type HealthTile =
  | { kind: 'none' }
  | { kind: 'no-runs' }
  | { kind: 'rate'; percent: number; succeeded: number; finished: number };

/**
 * The three things a tile can say. A null rate is "no finished run in the window", which is neither
 * 0 nor 100. Nothing at all is `none`: the call failed, or this workflow is not in the answer.
 */
export function healthTile(health: Pick<WorkflowHealth, 'successRate' | 'finishedRuns'> | undefined): HealthTile {
  if (!health) return { kind: 'none' };
  if (health.successRate === null || health.successRate === undefined || health.finishedRuns <= 0) {
    return { kind: 'no-runs' };
  }
  return {
    kind: 'rate',
    percent: Math.round(health.successRate * 100),
    succeeded: Math.round(health.successRate * health.finishedRuns),
    finished: health.finishedRuns,
  };
}

export interface RunWorkflowInput {
  workflowId: string;
  entryId: string;
  /** One per dialog open, so a repeat of the same confirm finds the run the first one started. */
  idempotencyKey: string;
}

const runStartedSchema = z.looseObject({ runId: z.string(), repeated: z.boolean().nullish() });

/**
 * Starts a workflow on one entry. The API queues a run and answers 202 with its id, or 200 with the
 * earlier run's id when the key was seen. It sends real email and webhooks, so callers confirm first.
 */
export function useRunWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RunWorkflowInput) => {
      const response = await api.post<unknown>(
        `/api/workflows/${encodeURIComponent(input.workflowId)}/run`,
        { entryId: input.entryId },
        { headers: { 'Idempotency-Key': input.idempotencyKey } },
      );
      return parseResponse(runStartedSchema, response.data, 'POST /api/workflows/{id}/run');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflow-health'] });
      void queryClient.invalidateQueries({ queryKey: ['workflow-runs'] });
    },
  });
}

/** What each refusal of a run says. The API's own words win where it sends them, except on 403 and 404. */
export function runNowMessage(error: unknown): string {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  switch (status) {
    case 403:
      return 'You do not have permission to run workflows.';
    case 404:
      return 'That workflow or entry no longer exists, or you cannot read the entry.';
    case 400:
      return apiErrorMessage(error, 'That entry is not of a type this workflow runs on.');
    case 409:
      return apiErrorMessage(error, 'The workflow is switched off, or the entry does not meet its conditions.');
    default:
      return apiErrorMessage(error, 'The run could not be started.');
  }
}
