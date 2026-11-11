'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { api, paginatedSchema, parseResponse } from '@/lib/api';
import { useCurrentTenant } from '@/hooks/use-tenants';
import type { Sample } from '@/lib/overview';

/**
 * The newest rows a stat card draws its sparkline from. One page, never the whole list: the page
 * is the bound. `totalItems` is the real total whatever the page holds.
 */
export const SAMPLE_SIZE = 100;

/*
 * Missing from core: a range-windowed series. GET /api/contents/counts takes only `contentType`
 * (no `from` or `range`, no bucketed `series`), and GET /api/overview counts cover 24 hours only.
 * Until core sends per-range counts with a bucketed series, the value is the list total, and the
 * bars and the change sentence are read from this sample. They say how many sampled rows fall in
 * each slice, not how many exist, and the change is left out when the sample cannot cover two ranges.
 */
const rowSchema = z.looseObject({ createdAt: z.string() });
const pageSchema = paginatedSchema(rowSchema);

const STALE_MS = 60 * 1000;

function useSample(key: string, url: string, params: Record<string, string | number>) {
  const tenant = useCurrentTenant();
  return useQuery({
    queryKey: ['overview', key, tenant],
    queryFn: async (): Promise<Sample> => {
      const response = await api.get<unknown>(url, { params: { page: 1, pageSize: SAMPLE_SIZE, ...params } });
      const page = parseResponse(pageSchema, response.data, `GET ${url}`);
      return { rows: page.items, totalItems: page.totalItems, hasNextPage: page.hasNextPage };
    },
    retry: false,
    staleTime: STALE_MS,
  });
}

/** Entries in one status, newest first. */
export function useEntrySample(status: 'Published' | 'Draft') {
  return useSample(`entries-${status}`, '/api/contents', { status, sortOrder: 'desc' });
}

/** Workflow runs, newest first, optionally only one status. */
export function useRunSample(status?: 'Failed' | 'PartiallyFailed') {
  return useSample(`runs-${status ?? 'all'}`, '/api/workflow-runs', status ? { status } : {});
}
