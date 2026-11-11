'use client';

import Link from 'next/link';
import { IconArrowRight } from '@/components/icons';
import { hrefForRef } from '@/hooks/use-needs-you';
import { useOverviewSummary } from '@/hooks/use-overview-summary';
import { cn } from '@/lib/utils';

/**
 * "Today at a glance": GET /api/overview's list in the order core sends it, worst first. It is the
 * card that sits first when no extension has put a card there. Hidden against a core without the
 * route, since there is nothing to read.
 */
export function GlanceCard() {
  const { summary } = useOverviewSummary();
  if (!summary) return null;

  return (
    <section aria-labelledby="overview-glance" className="border-border bg-card rise grid gap-3 rounded-[18px] border p-5">
      <div className="grid gap-1">
        <h2 id="overview-glance" className="font-display text-xl font-semibold tracking-[-0.02em]">
          Today at a glance
        </h2>
        <p className="text-muted-foreground text-[13px]">Read straight from the API, in the order that matters.</p>
      </div>
      {summary.needsYou.length === 0 ? (
        <p className="text-secondary-foreground text-sm">{summary.headline}. Nothing is waiting on you.</p>
      ) : (
        <ul className="grid gap-1">
          {summary.needsYou.map((item) => (
            <li key={item.id}>
              <Link
                href={hrefForRef(item.ref).href}
                className="hover:bg-secondary flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[14.5px] transition-colors duration-150 outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span aria-hidden className={cn('size-2 shrink-0 rounded-full', item.severity === 'bad' ? 'bg-destructive' : 'bg-warning')} />
                <span className="flex-1">{item.text}</span>
                <IconArrowRight className="text-muted-foreground size-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
