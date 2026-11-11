'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LiveSwitch } from '@/components/patterns/live-switch';
import { useActivity } from '@/hooks/use-activity';
import { ActivityRow } from '@/components/activity/activity-row';
import type { ActivityItem } from '@/lib/activity';

const SHOWN = 8;

/**
 * Who did what, as it happens, from GET /api/activity. Polled like the workflow runs list, with a
 * Pause that holds the rows still so they can be read: paused, the card keeps the rows it had when
 * the button was pressed and the poll behind it carries on for Needs you.
 *
 * An API with no feed (404) or a caller who may not read it (403) gets a short note and the audit
 * log, which records the same thing less quickly.
 */
export function LiveActivityCard() {
  const { items, available, isLoading, isError, dataUpdatedAt, refetch } = useActivity();
  // The rows as they were when Pause was pressed, and the moment, so their ages stay as they were.
  const [frozen, setFrozen] = useState<{ items: ActivityItem[]; at: number } | null>(null);
  const [mountedAt] = useState(() => Date.now());
  const live = frozen === null;
  const shown = (frozen?.items ?? items).slice(0, SHOWN);
  const now = frozen?.at ?? (dataUpdatedAt || mountedAt);

  return (
    <section aria-labelledby="overview-activity" className="border-border bg-card rise grid gap-2.5 rounded-[18px] border p-5">
      <div className="flex items-center gap-2.5">
        <h2 id="overview-activity" className="font-display flex-1 text-xl font-semibold tracking-[-0.02em]">
          Live activity
        </h2>
        {available && (
          <LiveSwitch
            live={live}
            compact
            stalled={isError}
            label="Live activity updates"
            onChange={(next) => setFrozen(next ? null : { items, at: dataUpdatedAt || mountedAt })}
          />
        )}
      </div>
      {!available ? (
        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center text-sm">
          This API does not send an activity feed to this account. The{' '}
          <Link href="/audit" className="text-accent-foreground font-semibold hover:underline">
            audit log
          </Link>{' '}
          records who changed what.
        </p>
      ) : isError && items.length === 0 ? (
        <p role="alert" className="text-destructive text-sm">
          Activity could not be loaded.{' '}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      ) : isLoading ? (
        <p className="text-muted-foreground p-6 text-center text-sm">Loading activity.</p>
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center text-sm">
          Nothing has happened yet. It appears here as it does.
        </p>
      ) : (
        <ul aria-label="Recent activity">
          {shown.map((item) => (
            <ActivityRow key={`${item.id}:${item.kind}`} item={item} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}
