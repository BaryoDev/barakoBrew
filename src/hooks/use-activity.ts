'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { api, parseResponse } from '@/lib/api';
import { activityPageSchema, type ActivityPage } from '@/lib/activity';
import { useCurrentTenant } from '@/hooks/use-tenants';

/** The pace of the poll while the feed is live and the tab is visible. */
export const ACTIVITY_POLL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
/** Rows read per poll. The cards show fewer; the rest are what Needs you looks through. */
export const ACTIVITY_PAGE_SIZE = 50;
/** The most core returns in one page. Its cursor only moves forward, so older rows come from a larger page. */
export const ACTIVITY_MAX_PAGE_SIZE = 100;

function statusOf(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

/**
 * Whether the API has no feed for this caller: 404 on an API older than 5.5, 403 for a caller
 * without the audit log. Neither gets better by asking again, so polling stops and the cards say
 * what they used to.
 */
export function isActivityUnavailable(error: unknown): boolean {
  const status = statusOf(error);
  return status === 404 || status === 403 || status === 401;
}

/** The wait after the n-th failure in a row: the poll interval doubled each time, up to a minute. */
export function activityDelay(failures: number): number {
  return Math.min(ACTIVITY_POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
}

/**
 * The newest page of GET /api/activity, polled like the workflow runs list: every few seconds while
 * `live` and the tab is visible (react-query does not poll a hidden tab), longer after errors, and
 * not at all once the API says there is no feed for this caller.
 *
 * `available` is false only for that answer. While loading and after a transient error it is true,
 * so a slow network does not flash the fallback.
 */
export function useActivity({
  live = true,
  kinds,
  enabled = true,
  pageSize = ACTIVITY_PAGE_SIZE,
}: { live?: boolean; kinds?: readonly string[]; enabled?: boolean; pageSize?: number } = {}) {
  const tenant = useCurrentTenant();
  const kindList = kinds?.join(',') ?? '';

  const query = useQuery({
    queryKey: ['activity', tenant, kindList, pageSize],
    enabled,
    queryFn: async (): Promise<ActivityPage> => {
      const response = await api.get<unknown>('/api/activity', {
        params: { pageSize, ...(kindList ? { kinds: kindList } : {}) },
      });
      return parseResponse(activityPageSchema, response.data, 'GET /api/activity');
    },
    retry: false,
    refetchInterval: (q) => {
      if (!live || isActivityUnavailable(q.state.error)) return false;
      return activityDelay(q.state.fetchFailureCount);
    },
  });

  const unavailable = isActivityUnavailable(query.error);
  return {
    items: query.data?.items ?? [],
    available: !unavailable,
    /** True when the API answered 404: it has no feed at all, so the nav item is left out. */
    missing: statusOf(query.error) === 404,
    isLoading: query.isLoading,
    isError: query.isError && !unavailable,
    dataUpdatedAt: query.dataUpdatedAt,
    refetch: query.refetch,
  };
}

/**
 * Whether the rail should leave Activity out: one row asked once per tenant, on its own key. A 404
 * (an API before 5.5) and a 403 (a caller without the audit log) are answered as data and kept for
 * good, so the answer is not asked again; any other failure is an error and is retried as usual.
 */
export function useActivityGone(enabled: boolean): boolean {
  const tenant = useCurrentTenant();
  const { data } = useQuery({
    queryKey: ['activity-probe', tenant],
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<{ gone: boolean }> => {
      try {
        await api.get('/api/activity', { params: { pageSize: 1 } });
        return { gone: false };
      } catch (error) {
        const status = statusOf(error);
        if (status === 404 || status === 403) return { gone: true };
        throw error;
      }
    },
  });
  return data?.gone === true;
}
