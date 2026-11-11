'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/patterns/page-header';
import { LiveSwitch } from '@/components/patterns/live-switch';
import { ErrorState } from '@/components/patterns/error-state';
import { ActivityRow } from '@/components/activity/activity-row';
import { useActivity } from '@/hooks/use-activity';
import { ACTIVITY_FILTERS } from '@/lib/activity';
import { cn } from '@/lib/utils';

/**
 * Everything that happened in the tenant, newest first, from GET /api/activity. The chips send
 * `kinds`; Live polls like the workflow runs list, only while this tab is visible, and Paused stops
 * the poll so the rows can be read still.
 */
export default function ActivityPage() {
  const [filterId, setFilterId] = useState('all');
  const [live, setLive] = useState(true);
  const filter = ACTIVITY_FILTERS.find((f) => f.id === filterId) ?? ACTIVITY_FILTERS[0];
  const { items, available, isLoading, isError, dataUpdatedAt, refetch } = useActivity({ live, kinds: filter.kinds });
  const [mountedAt] = useState(() => Date.now());
  const now = dataUpdatedAt || mountedAt;

  return (
    <>
      <PageHeader
        title="Activity"
        description="What happened in this tenant, newest first."
        badge={
          <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 font-mono text-xs">
            GET /api/activity?since=&amp;kinds=
          </span>
        }
      />

      {!available ? (
        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center text-sm">
          This API does not send an activity feed to this account. The{' '}
          <Link href="/audit" className="text-accent-foreground font-semibold hover:underline">
            audit log
          </Link>{' '}
          records who changed what.
        </p>
      ) : (
        <section aria-label="Activity feed" className="border-border bg-card overflow-hidden rounded-2xl border">
          <div className="border-border flex flex-wrap items-center gap-1.5 border-b px-4 py-3.5">
            {ACTIVITY_FILTERS.map((f) => {
              const on = f.id === filter.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilterId(f.id)}
                  className={cn(
                    'inline-flex h-[30px] items-center gap-1.5 rounded-full border px-[11px] text-[12.5px] font-semibold outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50',
                    on ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground',
                  )}
                >
                  {f.label}
                  {on && !isLoading && <span className="font-mono text-[11px] opacity-70">{items.length}</span>}
                </button>
              );
            })}
            <span className="flex-1" />
            <LiveSwitch live={live} compact stalled={isError} label="Live activity updates" onChange={setLive} />
          </div>

          {isError && items.length === 0 ? (
            <div className="p-4">
              <ErrorState entity="activity" onRetry={() => void refetch()} />
            </div>
          ) : isLoading ? (
            <p className="text-muted-foreground p-6 text-center text-sm">Loading activity.</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              {filter.id === 'all' ? 'Nothing has happened yet. It appears here as it does.' : 'Nothing of this kind yet.'}
            </p>
          ) : (
            <ul aria-label="Activity" className="px-4">
              {items.map((item) => (
                <ActivityRow key={`${item.id}:${item.kind}`} item={item} now={now} />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
