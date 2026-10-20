'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRunSample } from '@/hooks/use-overview';
import { useNavMetrics } from '@/hooks/use-nav-metrics';
import { hrefsOf, useAllowedGroups } from '@/hooks/use-visible-hrefs';
import { cn } from '@/lib/utils';

interface Row {
  key: string;
  title: string;
  detail: string;
  href: string;
  dot: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What is waiting on someone, from the counts the API already gives: failed runs, unresolved client
 * errors and recent bounces. A feed of reviews and approvals does not exist yet (barakoCMS#677), and
 * the card says so rather than inventing one.
 */
export function NeedsYouCard() {
  const failed = useRunSample('Failed');
  const allowed = useAllowedGroups();
  const wanted = useMemo(() => {
    const visible = hrefsOf(allowed);
    return new Set(['/errors', '/email-events'].filter((h) => visible.has(h)));
  }, [allowed]);
  const metrics = useNavMetrics(wanted);

  const rows: Row[] = [];
  const failedTotal = failed.data?.totalItems ?? 0;
  if (failedTotal > 0) {
    rows.push({
      key: 'runs',
      title: plural(failedTotal, 'workflow run failed', 'workflow runs failed'),
      detail: 'Only a person can decide whether to retry.',
      href: '/workflow-runs',
      dot: 'bg-destructive',
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

  return (
    <section aria-labelledby="overview-needs" className="border-border bg-card rise grid gap-3 rounded-[18px] border p-5">
      <div className="flex items-center gap-2.5">
        <h2 id="overview-needs" className="font-display flex-1 text-xl font-semibold tracking-[-0.02em]">
          Needs you
        </h2>
        <span className="text-muted-foreground font-mono text-xs">{rows.length}</span>
      </div>
      {failed.isError && (
        <p role="alert" className="text-destructive text-sm">
          Failed runs could not be loaded.
        </p>
      )}
      {rows.map((row) => (
        <Link
          key={row.key}
          href={row.href}
          className="bg-background border-border hover:border-primary rise flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors duration-150 outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span aria-hidden className={cn('size-2 rounded-full', row.dot)} />
          <span className="grid flex-1 gap-0.5">
            <span className="text-[14.5px] font-semibold">{row.title}</span>
            <span className="text-muted-foreground text-[12.5px]">{row.detail}</span>
          </span>
          <span className="border-border bg-card rounded-[9px] border px-3 py-1.5 text-[13px] font-semibold">Open</span>
        </Link>
      ))}
      {!failed.isError && !failed.isLoading && rows.length === 0 && (
        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center">
          Nothing from runs, errors or email is waiting on you.
        </p>
      )}
      <p className="text-muted-foreground text-[12.5px]">
        Entries waiting for review and other approvals are not available yet. They need a feed the API does not
        have (barakoCMS#677).
      </p>
    </section>
  );
}
