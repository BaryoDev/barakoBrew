'use client';

import { useMemo } from 'react';
import { useRunSample } from '@/hooks/use-overview';
import { useNavMetrics } from '@/hooks/use-nav-metrics';
import { hrefsOf, useAllowedGroups } from '@/hooks/use-visible-hrefs';

export interface NeedsRow {
  key: string;
  title: string;
  detail: string;
  href: string;
  /** The class of the dot: red when it wants a decision, amber when it is a heads-up. */
  dot: string;
  /** True when only a person can decide it, which is what the Overview verdict says out loud. */
  decision?: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What is waiting on someone, from the counts the API already gives: failed runs, unresolved client
 * errors and recent bounces. The Overview heading and the Needs you card both read this, so the
 * sentence at the top and the list below cannot disagree.
 */
export function useNeedsYou() {
  const failed = useRunSample('Failed');
  const allowed = useAllowedGroups();
  const wanted = useMemo(() => {
    const visible = hrefsOf(allowed);
    return new Set(['/errors', '/email-events'].filter((h) => visible.has(h)));
  }, [allowed]);
  const metrics = useNavMetrics(wanted);

  const rows: NeedsRow[] = [];
  const failedTotal = failed.data?.totalItems ?? 0;
  if (failedTotal > 0) {
    rows.push({
      key: 'runs',
      title: plural(failedTotal, 'workflow run failed', 'workflow runs failed'),
      detail: 'Only a person can decide whether to retry.',
      href: '/workflow-runs',
      dot: 'bg-destructive',
      decision: true,
    });
  }
  const errors = metrics.unresolvedErrors;
  if (errors && errors.value > 0) {
    rows.push({
      key: 'errors',
      title: `${errors.value}${errors.atLeast ? '+' : ''} unresolved ${errors.value === 1 ? 'error' : 'errors'}`,
      detail: 'Reported by the sites and apps using this API.',
      href: '/errors',
      dot: 'bg-destructive',
    });
  }
  const bounces = metrics.recentBounces;
  if (bounces && bounces.value > 0) {
    rows.push({
      key: 'bounces',
      title: `${bounces.value}${bounces.atLeast ? '+' : ''} ${bounces.value === 1 ? 'email' : 'emails'} bounced`,
      detail: 'In the last 24 hours.',
      href: '/email-events',
      dot: 'bg-warning',
    });
  }

  return { rows, isLoading: failed.isLoading, isError: failed.isError };
}
