'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useNeedsYou, type NeedsRow } from '@/hooks/use-needs-you';
import { useResolveOverviewItem } from '@/hooks/use-overview-summary';
import { IconCheck } from '@/components/icons';
import { cn } from '@/lib/utils';

const MAX_ROWS = 6;

/** How long Undo is offered. Core has no un-resolve, so the call is held back this long. */
export const UNDO_MS = 6000;

/**
 * Resolving is held for UNDO_MS before the call goes out, because core's resolve cannot be taken
 * back. Undo inside that time sends nothing. Leaving the page sends what is still waiting, so a
 * click is never lost.
 */
function useResolveWithUndo() {
  const resolve = useResolveOverviewItem();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const waiting = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const send = useRef((id: string) => {});

  const show = (id: string) =>
    setHidden((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

  send.current = (id: string) => {
    waiting.current.delete(id);
    resolve.mutate(id, {
      onError: () => {
        show(id);
        toast.error('Could not resolve that. It is still on the list.');
      },
    });
  };

  useEffect(() => {
    const timers = waiting.current;
    return () => {
      for (const [id, timer] of timers) {
        clearTimeout(timer);
        send.current(id);
      }
    };
  }, []);

  function start(row: NeedsRow) {
    const id = row.resolveId;
    if (!id) return;
    setHidden((current) => new Set(current).add(id));
    waiting.current.set(
      id,
      setTimeout(() => send.current(id), UNDO_MS),
    );
    toast('Marked as resolved', {
      description: row.title,
      duration: UNDO_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          clearTimeout(waiting.current.get(id));
          waiting.current.delete(id);
          show(id);
        },
      },
    });
  }

  return { hidden, start };
}

/**
 * What is waiting on someone, as useNeedsYou reads it: GET /api/overview's list when the API has it
 * (each row with its own button and, where core can clear it, a check mark with undo), else the
 * activity feed's warnings and errors, else the counts of failed runs, errors and bounces.
 */
export function NeedsYouCard() {
  const { rows: all, source, isLoading, isError } = useNeedsYou();
  const { hidden, start } = useResolveWithUndo();
  const rows = all.filter((row) => !(row.resolveId && hidden.has(row.resolveId)));

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
        <div
          key={row.key}
          className="bg-background border-border rise flex items-center gap-3 rounded-xl border px-3.5 py-3"
        >
          <span aria-hidden className={cn('size-2 rounded-full', row.dot)} />
          <span className="grid flex-1 gap-0.5">
            <span className="text-[14.5px] font-semibold">{row.title}</span>
            {row.detail && <span className="text-muted-foreground text-[12.5px]">{row.detail}</span>}
          </span>
          {row.resolveId && (
            <button
              type="button"
              aria-label={`Mark resolved: ${row.title}`}
              onClick={() => start(row)}
              className="border-border bg-card hover:border-primary grid size-8 place-items-center rounded-[9px] border outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <IconCheck className="size-4" aria-hidden />
            </button>
          )}
          <Link
            href={row.href}
            aria-label={`${row.cta ?? 'Open'}: ${row.title}`}
            className="border-border bg-card hover:border-primary rounded-[9px] border px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150 outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {row.cta ?? 'Open'}
          </Link>
        </div>
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
