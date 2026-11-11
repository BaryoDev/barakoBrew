'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api, isForbidden, isNotFound, parseResponse } from '@/lib/api';
import { useCurrentTenant } from '@/hooks/use-tenants';

const severity = z.enum(['ok', 'warn', 'bad']).catch('ok');

const stripItem = z.looseObject({
  name: z.string(),
  status: severity,
  version: z.string().nullish(),
  ms: z.number().nullish(),
  detail: z.string().nullish(),
});

const needsItem = z.looseObject({
  id: z.string(),
  severity: severity,
  text: z.string(),
  ref: z.looseObject({ kind: z.string(), id: z.string().nullish() }),
  resolvable: z.boolean().catch(false),
});

/**
 * GET /api/overview. The verdict, the headline, the health strip and the Needs you list are the
 * server's, so every client agrees. Counts are 24 hours only (current and prior); the Overview
 * stat cards do not read them because they scale with the 7 / 30 / 90 day range.
 */
export const overviewSchema = z.looseObject({
  verdict: severity,
  headline: z.string(),
  health: z.looseObject({ verdict: severity, items: z.array(stripItem) }).nullish(),
  needsYou: z.array(needsItem),
});

export type OverviewSummary = z.infer<typeof overviewSchema>;
export type OverviewNeed = z.infer<typeof needsItem>;
export type OverviewStripItem = z.infer<typeof stripItem>;

export const OVERVIEW_KEY = 'overview-summary';
const POLL_MS = 30 * 1000;

/**
 * The summary, or `available: false` against a core without the route (404) or for a caller it
 * refuses (401, 403), so the page falls back to what it read before. Everything else is an error.
 */
export function useOverviewSummary() {
  const tenant = useCurrentTenant();
  const query = useQuery({
    queryKey: [OVERVIEW_KEY, tenant],
    queryFn: async () => {
      try {
        const response = await api.get<unknown>('/api/overview');
        return { available: true as const, summary: parseResponse(overviewSchema, response.data, 'GET /api/overview') };
      } catch (error) {
        if (isNotFound(error) || isForbidden(error)) return { available: false as const };
        throw error;
      }
    },
    retry: false,
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });
  return {
    summary: query.data?.available ? query.data.summary : undefined,
    unavailable: query.data?.available === false,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/** POST /api/overview/items/{id}/resolve. Core resolves `mail.bounces` only. Refreshes the summary. */
export function useResolveOverviewItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/overview/items/${encodeURIComponent(id)}/resolve`);
    },
    onSettled: () => client.invalidateQueries({ queryKey: [OVERVIEW_KEY] }),
  });
}
