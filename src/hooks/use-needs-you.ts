'use client';

import { useMemo } from 'react';
import { useRunSample } from '@/hooks/use-overview';
import { useNavMetrics } from '@/hooks/use-nav-metrics';
import { useActivity } from '@/hooks/use-activity';
import { attentionRows, relativeTime, safeRef, type ActivityItem } from '@/lib/activity';
import { useOverviewSummary, type OverviewNeed } from '@/hooks/use-overview-summary';
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
  /** The words on the button: Review for what is broken, Open for where to look. */
  cta?: 'Review' | 'Open';
  /** Core's id for the row, set only when `POST /api/overview/items/{id}/resolve` clears it. */
  resolveId?: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Where a row opens when the API sent no usable `ref`. */
function fallbackHref(kind: string): string {
  if (kind.startsWith('run.')) return '/workflow-runs';
  if (kind === 'bounced') return '/email-events';
  return '/audit';
}

/** Where a core item's `ref` opens, the design's deep links: the run, Entries filtered, the mail screen. */
export function hrefForRef(ref: { kind: string; id?: string | null }): { href: string; cta: 'Review' | 'Open' } {
  switch (ref.kind) {
    case 'mailBounces':
      return { href: '/email-events', cta: 'Review' };
    case 'workflowRuns':
      return { href: ref.id ? `/workflow-runs?run=${encodeURIComponent(ref.id)}` : '/workflow-runs?status=PartiallyFailed', cta: 'Review' };
    case 'content':
      return { href: '/content?status=Scheduled', cta: 'Open' };
    case 'runner':
      return { href: '/ops/health', cta: 'Open' };
    default:
      return { href: '/audit', cta: 'Open' };
  }
}

function rowFromCore(item: OverviewNeed): NeedsRow {
  const { href, cta } = hrefForRef(item.ref);
  return {
    key: item.id,
    title: item.text,
    detail: '',
    href,
    cta,
    dot: item.severity === 'bad' ? 'bg-destructive' : 'bg-warning',
    decision: item.severity === 'bad',
    resolveId: item.resolvable ? item.id : undefined,
  };
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
  const overview = useOverviewSummary();
  const activity = useActivity();
  const failed = useRunSample('Failed');
  // The rail badge counts partly failed runs as needing a look, so the fallback does too.
  const partial = useRunSample('PartiallyFailed');
  const allowed = useAllowedGroups();
  const wanted = useMemo(() => {
    const visible = hrefsOf(allowed);
    return new Set(['/errors', '/email-events'].filter((h) => visible.has(h)));
  }, [allowed]);
  const metrics = useNavMetrics(wanted);

  const rows: NeedsRow[] = [];
  const fromCore = !!overview.summary;
  const fromFeed = !fromCore && activity.available;

  if (fromCore) {
    // GET /api/overview already lists them worst first, with the ids the resolve route takes.
    rows.push(...overview.summary!.needsYou.map(rowFromCore));
  } else if (fromFeed) {
    rows.push(...attentionRows(activity.items).map(rowFromActivity));
  } else {
    const failedTotal = (failed.data?.totalItems ?? 0) + (partial.data?.totalItems ?? 0);
    if (failedTotal > 0) {
      rows.push({
        key: 'runs',
        title: partial.data?.totalItems
          ? plural(failedTotal, 'workflow run failed or partly failed', 'workflow runs failed or partly failed')
          : plural(failedTotal, 'workflow run failed', 'workflow runs failed'),
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
  if (!fromCore && !fromFeed && bounces && bounces.value > 0) {
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
    source: fromCore || fromFeed ? ('activity' as const) : ('counts' as const),
    isLoading: overview.isLoading || (fromCore ? false : fromFeed ? activity.isLoading : failed.isLoading || partial.isLoading),
    isError: fromCore ? false : fromFeed ? activity.isError : failed.isError || partial.isError,
  };
}
