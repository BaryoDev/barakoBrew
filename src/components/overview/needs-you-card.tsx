'use client';

import Link from 'next/link';
import { useNeedsYou } from '@/hooks/use-needs-you';
import { cn } from '@/lib/utils';

const MAX_ROWS = 6;

/**
 * What is waiting on someone, as useNeedsYou reads it: the activity feed's warnings and errors when
 * the API has the feed, else the counts of failed runs, unresolved errors and recent bounces.
 */
export function NeedsYouCard() {
  const { rows, source, isLoading, isError } = useNeedsYou();

  return (
    <section aria-labelledby="overview-needs" className="border-border bg-card rise grid gap-3 rounded-[18px] border p-5">
      <div className="flex items-center gap-2.5">
        <h2 id="overview-needs" className="font-display flex-1 text-xl font-semibold tracking-[-0.02em]">
          Needs you
        </h2>
        <span className="text-muted-foreground font-mono text-xs">{rows.length}</span>
      </div>
      {isError && (
        <p role="alert" className="text-destructive text-sm">
          Needs you could not be loaded.
        </p>
      )}
      {rows.slice(0, MAX_ROWS).map((row) => (
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
      {rows.length > MAX_ROWS && (
        <p className="text-muted-foreground text-[12.5px]">
          and {rows.length - MAX_ROWS} more.{' '}
          <Link href="/audit" className="text-accent-foreground font-semibold hover:underline">
            Open the audit log
          </Link>
        </p>
      )}
      {!isError && !isLoading && rows.length === 0 && (
        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center">
          {source === 'activity' ? 'All clear. Nothing is waiting on you.' : 'Nothing from runs, errors or email is waiting on you.'}
        </p>
      )}
    </section>
  );
}
