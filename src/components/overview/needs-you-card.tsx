'use client';

import Link from 'next/link';
import { useNeedsYou } from '@/hooks/use-needs-you';
import { cn } from '@/lib/utils';

/**
 * What is waiting on someone, from the counts the API already gives: failed runs, unresolved client
 * errors and recent bounces. A feed of reviews and approvals does not exist yet (barakoCMS#677), and
 * the card says so rather than inventing one.
 */
export function NeedsYouCard() {
  const { rows, isLoading, isError } = useNeedsYou();
  const failed = { isError, isLoading };

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
