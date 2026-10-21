'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useContents } from '@/hooks/use-contents';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { IconArrowRight, IconContent } from '@/components/icons';
import { OverviewHeader } from '@/components/overview/overview-header';
import { StatCards } from '@/components/overview/stat-cards';
import { QuickActions } from '@/components/overview/quick-actions';
import { SystemStrip } from '@/components/overview/system-strip';
import { NeedsYouCard } from '@/components/overview/needs-you-card';
import { LiveActivityCard } from '@/components/overview/live-activity-card';
import { WorkflowHealthCard } from '@/components/overview/workflow-health-card';
import { OverviewAnalytics } from '@/components/analytics/overview-analytics';
import { formatDistanceToNow } from 'date-fns';
import { contentTitle } from '@/lib/content-title';
import type { Range } from '@/lib/overview';

export default function DashboardPage() {
  const [range, setRange] = useState<Range>(30);
  const { data: contents, isLoading: contentsLoading } = useContents({ pageSize: 5 });

  return (
    <div className="rise grid max-w-[1240px] gap-6">
      <OverviewHeader range={range} onRange={setRange} />
      <StatCards range={range} />
      <div className="flex flex-wrap items-center gap-2">
        <QuickActions />
        <span className="flex-1" />
        <SystemStrip />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-4">
        <NeedsYouCard />
        <LiveActivityCard />
      </div>

      <WorkflowHealthCard />

      <OverviewAnalytics />

      <div>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Latest entries</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground -my-1">
                <Link href="/content">
                  View all
                  <IconArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {contentsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !contents?.items.length ? (
              <div className="text-muted-foreground py-8 text-center text-sm">
                No entries yet. Create a content type, then add your first entry.
              </div>
            ) : (
              <ul className="divide-y">
                {contents.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/content/${item.id}`}
                      className="hover:bg-accent -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors"
                    >
                      <IconContent className="text-muted-foreground size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {contentTitle(item.data, item.id)}
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">{item.contentType}</span>
                      <span className="text-muted-foreground hidden shrink-0 text-xs sm:block">
                        {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
