'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { api, isNotFound, parseResponse } from '@/lib/api';
import type { ActivityPage } from '@/types/activity';

export const ACTIVITY_POLL_MS = 5000;
const PAGE_SIZE = 50;

const rowSchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: z.string(),
  severity: z.string(),
  actor: z.object({ kind: z.string(), name: z.string() }),
  subject: z.object({ kind: z.string(), id: z.string(), title: z.string() }),
  text: z.string(),
  ref: z.string(),
});

const pageSchema = z.object({
  items: z.array(rowSchema),
  nextCursor: z
    .string()
    .nullish()
    .transform((cursor) => cursor ?? null),
});

export const ACTIVITY_KEY = ['activity'] as const;

async function fetchActivity(cursor: string | undefined): Promise<ActivityPage> {
  const { data } = await api.get('/api/activity', {
    params: { pageSize: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
  });
  return parseResponse(pageSchema, data, '/api/activity');
}

/**
 * The whole feed, newest first, paged by cursor. The filter chips narrow what is loaded, so the
 * counts on them come from the same rows. With `live` the loaded pages are refetched every few
 * seconds.
 */
export function useActivity(live: boolean) {
  return useInfiniteQuery({
    queryKey: [...ACTIVITY_KEY, 'list'],
    queryFn: ({ pageParam }) => fetchActivity(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: live ? ACTIVITY_POLL_MS : false,
    retry: false,
  });
}

/**
 * Whether the API serves the feed at all. False only on a 404, which is an API older than the
 * endpoint. Loading, a refusal and any other failure answer true, so the rail does not lose the
 * item because one request went wrong.
 */
export function useActivityAvailable(): boolean {
  const { data } = useQuery({
    queryKey: [...ACTIVITY_KEY, 'available'],
    queryFn: async () => {
      try {
        await api.get('/api/activity', { params: { pageSize: 1 } });
        return true;
      } catch (error) {
        return !isNotFound(error);
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data !== false;
}
