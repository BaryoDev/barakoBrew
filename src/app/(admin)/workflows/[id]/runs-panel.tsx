'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { useWorkflowDebugLogs } from '@/hooks/use-workflows';
import { toneForRunStatus, useWorkflowRuns } from '@/hooks/use-workflow-runs';
import { isForbidden, isNotFound } from '@/lib/api';

const RECENT_RUNS = 10;

/**
 * The workflow's recent runs from the run list, each linking to the run. An API without the list's
 * workflow filter, or a caller who cannot read the list, gets the debug log this panel showed before.
 */
export function RunsPanel({ workflowId }: { workflowId: string }) {
  const runs = useWorkflowRuns({ page: 1, pageSize: RECENT_RUNS, workflowId });

  if (runs.isLoading) return <TableSkeleton rows={3} />;
  if (runs.isError && !runs.data && (isNotFound(runs.error) || isForbidden(runs.error))) {
    return <DebugLogPanel workflowId={workflowId} />;
  }
  if (runs.isError && !runs.data) {
    return (
      <p role="alert" className="text-muted-foreground py-8 text-center text-sm">
        The runs could not be read.{' '}
        <button type="button" className="underline underline-offset-2" onClick={() => void runs.refetch()}>
          Try again
        </button>
      </p>
    );
  }

  // An API before barakoCMS#1165 ignores the filter and sends every workflow's runs.
  const all = runs.data?.items ?? [];
  const items = all.filter((run) => run.workflowDefinitionId === workflowId);
  // Rows of other workflows mean the filter was ignored, and the page of ten says nothing about
  // this workflow. "Has not run yet" would be a claim the data cannot back, so show the log.
  if (items.length < all.length) return <DebugLogPanel workflowId={workflowId} />;
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        This workflow has not run yet. It executes when matching content events occur.
      </p>
    );
  }

  return (
    <ul aria-label="Recent runs" className="space-y-2">
      {items.map((run) => (
        <li key={run.id}>
          <Link
            href={`/workflow-runs?run=${encodeURIComponent(run.id)}`}
            className="hover:bg-accent flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
          >
            <span className="mr-auto text-sm">{format(new Date(run.createdAt), 'PPp')}</span>
            <span className="text-muted-foreground text-xs">{run.triggerEvent}</span>
            <StatusBadge tone={toneForRunStatus(run.status)}>{run.status}</StatusBadge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DebugLogPanel({ workflowId }: { workflowId: string }) {
  const { data: logs, isLoading } = useWorkflowDebugLogs(workflowId);

  if (isLoading) return <TableSkeleton rows={3} />;
  if (!logs?.length) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        This workflow has not run yet. It executes when matching content events occur.
      </p>
    );
  }

  // Only true counts. An older API sends no field, and false is a log stored before redaction.
  const anyRedacted = logs.some((log) => log.redacted === true);

  return (
    <>
      {anyRedacted && (
        <p className="text-muted-foreground mb-2 text-xs">
          Redacted: credentials and exception messages are not stored.
        </p>
      )}
      <ul aria-label="Recent runs" className="space-y-2">
        {logs.map((log) => (
          <li key={log.id} className="rounded-md border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-sm">{format(new Date(log.executedAt), 'PPp')}</span>
              {log.redacted === true && (
                <StatusBadge tone="muted" dot={false}>
                  Redacted
                </StatusBadge>
              )}
              <StatusBadge tone={log.success ? 'success' : 'destructive'}>
                {log.success ? 'Succeeded' : 'Failed'}
              </StatusBadge>
            </div>
            <ul className="text-muted-foreground mt-1.5 space-y-0.5 text-xs">
              {log.actions.map((action, i) => (
                <li key={i}>
                  {action.actionType}: {action.success ? 'ok' : action.errorMessage ?? 'failed'}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
