'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/patterns/status-badge';
import { IconArrowRight } from '@/components/icons';
import { RunProgressStrip } from '@/components/workflow/run-progress';
import { runStatusLabel, toneForRunStatus, useWorkflowRuns } from '@/hooks/use-workflow-runs';

/** How many runs the page shows. The full list is one click away. */
export const RECENT_RUN_COUNT = 5;

function startedAt(value: string): string {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleString();
}

/**
 * The latest runs of one workflow, each a button that opens it in Workflow runs, and a link to every
 * run. An API that ignores the workflow filter sends other workflows' runs too, and then there is
 * nothing true to say about this one, so the section stays out of the way.
 */
export function RecentRuns({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const runs = useWorkflowRuns({ page: 1, pageSize: RECENT_RUN_COUNT, workflowId });

  const all = runs.data?.items ?? [];
  const items = all.filter((run) => run.workflowDefinitionId === workflowId);
  if (items.length < all.length) return null;

  return (
    <section aria-labelledby={`recent-runs-${workflowId}`}>
      <div className="mb-1.5 flex items-center gap-2.5">
        <h3 id={`recent-runs-${workflowId}`} className="flex-1 text-sm font-semibold">
          Recent runs
        </h3>
        <Link href="/workflow-runs" className="text-primary inline-flex items-center gap-1 text-[13px] font-semibold hover:underline">
          All runs
          <IconArrowRight className="size-3.5" />
        </Link>
      </div>

      {runs.isLoading ? (
        <p className="text-muted-foreground py-4 text-center text-[13px]">Loading runs.</p>
      ) : runs.isError && !runs.data ? (
        <p role="alert" className="text-muted-foreground py-4 text-center text-[13px]">
          The runs could not be read.{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void runs.refetch()}>
            Try again
          </button>
        </p>
      ) : items.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-xl border border-dashed p-4 text-center text-[13.5px]">
          No runs yet. Press Run now to fire one.
        </p>
      ) : (
        <ul aria-label="Recent runs">
          {items.slice(0, RECENT_RUN_COUNT).map((run) => (
            <li key={run.id} className="border-border border-t first:border-t-0">
              <button
                type="button"
                onClick={() => router.push(`/workflow-runs?run=${encodeURIComponent(run.id)}`)}
                className="hover:bg-secondary flex w-full items-center gap-3 px-2 py-2.5 text-left text-[13.5px] outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <StatusBadge tone={toneForRunStatus(run.status)} className="min-w-24 justify-center">
                  {runStatusLabel(run.status)}
                </StatusBadge>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {run.contentType} {run.contentId.slice(0, 8)}
                </span>
                <RunProgressStrip actions={run.actions} />
                <span className="text-muted-foreground min-w-24 text-right text-[12.5px]">{startedAt(run.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
