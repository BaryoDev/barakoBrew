'use client';

import { format } from 'date-fns';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { useWorkflowDebugLogs } from '@/hooks/use-workflows';

export function RunsPanel({ workflowId }: { workflowId: string }) {
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
