'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { IconArrowRight } from '@/components/icons';
import { StatusBadge } from '@/components/patterns/status-badge';
import { ErrorState } from '@/components/patterns/error-state';
import { useWorkflows } from '@/hooks/use-workflows';
import { healthTile, useWorkflowHealth, type WorkflowOutcome } from '@/hooks/use-workflow-health';
import { toneForRunStatus } from '@/hooks/use-workflow-runs';
import { cn } from '@/lib/utils';

const ROWS = 8;
const BARS = 10;

function barTone(status: string): string {
  const tone = toneForRunStatus(status);
  if (tone === 'success') return 'bg-success';
  if (tone === 'destructive') return 'bg-destructive';
  if (tone === 'warning') return 'bg-warning';
  return 'bg-(--faint)';
}

/** The last ten outcomes, oldest on the left so the newest sits on the right. */
export function lastTen(outcomes: readonly WorkflowOutcome[]): WorkflowOutcome[] {
  return [...outcomes].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).slice(-BARS);
}

/**
 * The last outcomes per workflow. Hidden against an API without the health route, and says so
 * when the read fails rather than claiming the workflows have no runs.
 */
export function WorkflowHealthCard() {
  const { data: workflows, isLoading, isError: workflowsFailed, refetch } = useWorkflows();
  const health = useWorkflowHealth();

  if (health.unavailable) return null;

  return (
    <section aria-labelledby="overview-health" className="border-border bg-card rise grid gap-3 rounded-[18px] border p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="overview-health" className="font-display flex-1 text-xl font-semibold tracking-[-0.02em]">
          Workflow health
        </h2>
        <span className="text-muted-foreground text-[13px]">Last 10 runs of each, newest on the right</span>
        <Button asChild variant="link" size="sm" className="h-auto p-0 text-[13px] font-semibold">
          <Link href="/workflow-runs">
            Open runs
            <IconArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
      {health.isError || workflowsFailed ? (
        <ErrorState
          entity="workflow health"
          error={health.error}
          onRetry={() => {
            void refetch();
            void health.refetch();
          }}
          className="py-8"
        />
      ) : isLoading ? null : !workflows?.length ? (
        <p className="text-muted-foreground text-sm">No workflows yet.</p>
      ) : (
        <ul className="grid gap-0.5">
          {workflows.slice(0, ROWS).map((workflow) => {
            const h = health.healthOf(workflow.id);
            const tile = healthTile(h);
            const outcomes = lastTen(h?.lastOutcomes ?? []);
            const last = outcomes.at(-1);
            return (
              <li key={workflow.id} className="border-border border-t first:border-t-0">
                <Link
                  href={`/workflows/${workflow.id}`}
                  className="hover:bg-secondary grid grid-cols-[minmax(0,1.2fr)_auto_minmax(64px,auto)_minmax(72px,auto)] items-center gap-4 rounded-lg px-2.5 py-3 transition-colors duration-150 outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-[14.5px] font-semibold">{workflow.name}</span>
                    <span className="text-muted-foreground truncate text-[12.5px]">
                      {workflow.triggerContentType} · {workflow.triggerEvent}
                    </span>
                  </span>
                  <span className="flex h-[22px] items-end gap-[3px]" role="img" aria-label={`Last ${outcomes.length} runs`}>
                    {outcomes.map((o) => (
                      <span
                        key={o.runId}
                        title={o.status}
                        className={cn('h-full w-[7px] rounded-[2px]', barTone(o.status))}
                      />
                    ))}
                  </span>
                  <span className="font-display text-right text-[19px] font-semibold tracking-[-0.02em] tabular-nums">
                    {tile.kind === 'rate' ? (
                      <>
                        {tile.percent}%
                        <span className="sr-only">
                          {' '}
                          ({tile.succeeded} of {tile.finished})
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{'—'}</span>
                    )}
                  </span>
                  <span className="text-center">
                    {last ? (
                      <StatusBadge tone={toneForRunStatus(last.status)}>{last.status}</StatusBadge>
                    ) : (
                      <span className="text-muted-foreground text-xs">No runs</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
