'use client';

import { useMemo, useState } from 'react';
import { ActivityFeedRow } from '@/components/activity/activity-feed-row';
import { IconBolt } from '@/components/icons';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { PageHeader } from '@/components/patterns/page-header';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
import { useActivity } from '@/hooks/use-activity';
import { ACTIVITY_FILTERS, countByFilter, matchesFilter } from '@/lib/activity';
import { cn } from '@/lib/utils';

export default function ActivityPage() {
  const [filterId, setFilterId] = useState('all');
  const [live, setLive] = useState(true);
  const query = useActivity(live);

  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const counts = useMemo(() => countByFilter(rows), [rows]);
  const filter = ACTIVITY_FILTERS.find((f) => f.id === filterId) ?? ACTIVITY_FILTERS[0];
  const shown = rows.filter((row) => matchesFilter(row, filter));

  return (
    <div>
      <PageHeader
        title="Activity"
        description="What happened on the site."
        actions={
          <SegmentedControl
            aria-label="Feed updates"
            value={live ? 'live' : 'paused'}
            onValueChange={(value) => setLive(value === 'live')}
          >
            <SegmentedControlItem value="live">Live</SegmentedControlItem>
            <SegmentedControlItem value="paused">Paused</SegmentedControlItem>
          </SegmentedControl>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter activity">
        {ACTIVITY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={f.id === filter.id}
            onClick={() => setFilterId(f.id)}
            className={cn(
              'focus-visible:ring-ring/50 inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-bold outline-none focus-visible:ring-[3px]',
              f.id === filter.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
            <span className="font-mono">{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {query.isPending ? (
        <TableSkeleton rows={6} />
      ) : query.isError ? (
        <ErrorState entity="activity" error={query.error} onRetry={() => query.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={IconBolt}
          title="Nothing here yet"
          description={rows.length === 0 ? 'Activity on the site shows up here.' : 'No loaded activity matches this filter.'}
        />
      ) : (
        <ul className="rounded-lg border" aria-label="Activity">
          {shown.map((row) => (
            <ActivityFeedRow key={row.id} row={row} />
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading' : 'Load older activity'}
          </Button>
        </div>
      )}
    </div>
  );
}
