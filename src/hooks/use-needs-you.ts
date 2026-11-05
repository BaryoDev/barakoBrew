'use client';

import { useMemo } from 'react';
import { useRunSample } from '@/hooks/use-overview';
import { useNavMetrics } from '@/hooks/use-nav-metrics';
import { useActivity } from '@/hooks/use-activity';
import { attentionRows, relativeTime, safeRef, type ActivityItem } from '@/lib/activity';
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

/** Where a row opens when the API sent no usable `ref`. */
function fallbackHref(kind: string): string {
  if (kind.startsWith('run.')) return '/workflow-runs';
  if (kind === 'bounced') return '/email-events';
  return '/audit';
}

function rowFromActivity(item: ActivityItem): NeedsRow {
  const error = item.severity === 'error';
  return {
    key: item.id,
    title: item.text || item.kind,
    detail: [item.subject?.title, relativeTime(item.at, Date.now())].filter(Boolean).join(' · '),
    href: safeRef(item.ref) ?? fallbackHref(item.kind),
    dot: error ? 'bg-destructive' : 'bg-warning',
    decision: item.kind === 'run.failed',
  };
}

/**
 * What is waiting on someone. From GET /api/activity when the API has it: the rows it marks as a
 * warning or an error. Against an API without the feed (404) or a caller who may not read it (403),
 * from the counts it already gave: failed runs and recent bounces. Unresolved client errors are not
 * in the feed, so they come from their own count either way.
 *
 * The Overview heading and the Needs you card both read this, so the sentence at the top and the
 * list below cannot disagree.
 */
export function useNeedsYou() {
  const activity = useActivity();
  const failed = useRunSample('Failed');
  const allowed = useAllowedGroups();
  const wanted = useMemo(() => {
    const visible = hrefsOf(allowed);
    return new Set(['/errors', '/email-events'].filter((h) => visible.has(h)));
  }, [allowed]);
  const metrics = useNavMetrics(wanted);

  const rows: NeedsRow[] = [];
  const fromFeed = activity.available;

  if (fromFeed) {
    rows.push(...attentionRows(activity.items).map(rowFromActivity));
  } else {
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
  if (!fromFeed && bounces && bounces.value > 0) {
    rows.push({
      key: 'bounces',
      title: `${bounces.value}${bounces.atLeast ? '+' : ''} ${bounces.value === 1 ? 'email' : 'emails'} bounced`,
      detail: 'In the last 24 hours.',
      href: '/email-events',
      dot: 'bg-warning',
    });
  }

  return {
    rows,
    source: fromFeed ? ('activity' as const) : ('counts' as const),
    isLoading: fromFeed ? activity.isLoading : failed.isLoading,
    isError: fromFeed ? activity.isError : failed.isError,
  };
}
