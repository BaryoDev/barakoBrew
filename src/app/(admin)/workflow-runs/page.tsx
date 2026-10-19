'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { PageHeader } from '@/components/patterns/page-header';
import { PaginationControls } from '@/components/patterns/pagination-controls';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IconRefresh, IconWorkflows } from '@/components/icons';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { apiErrorMessage, isNotFound } from '@/lib/api';
import { useAccess } from '@/hooks/use-access';
import {
  ANY_STATUS,
  FAILURE_KINDS,
  RUN_CAPABILITIES,
  RUN_LEGACY_ROLES,
  RUN_STATUSES,
  parseRunId,
  type LivePause,
  isAbandonable,
  isCancellable,
  runAllowsRetry,
  runFailureKind,
  toneForRunStatus,
  useAbandonRun,
  useCancelRun,
  useRetryAttempt,
  useWorkflowRun,
  useWorkflowRuns,
  type WorkflowRun,
  type WorkflowRunList,
} from '@/hooks/use-workflow-runs';
import { AttemptCard } from './attempt-card';

const CARD = 'min-w-0 bg-card rounded-xl border p-6 shadow-[var(--shadow-card)]';

function formatMoment(value: string | null | undefined): string {
  if (!value) return '';
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleString();
}

function RunFacts({ run }: { run: WorkflowRun }) {
  const facts: { label: string; value: string }[] = [
    { label: 'Trigger', value: run.triggerEvent },
    { label: 'Content type', value: run.contentType },
    { label: 'Content', value: run.contentId },
    { label: 'Started', value: formatMoment(run.createdAt) },
  ];

  const completed = formatMoment(run.completedAt);
  if (completed) facts.push({ label: 'Finished', value: completed });

  const abandoned = formatMoment(run.abandonedAt);
  if (abandoned) facts.push({ label: 'Abandoned', value: abandoned });
  if (run.compensation) facts.push({ label: 'Rollback', value: run.compensation });
  if (run.executor) facts.push({ label: 'Runs on', value: run.executor });

  return (
    <dl className="mt-4 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={fact.label} className="flex justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">{fact.label}</dt>
          <dd className="truncate font-mono">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One chip for each status the API knows, with the count the API gives for it. The count is the
 * server's, taken over every page, so it is right on page 3 and under a filter. An API before
 * barakoCMS#1164 sends none, and then the chips are only filters.
 */
function StatusChips({
  value,
  counts,
  onChange,
}: {
  value: string;
  counts: WorkflowRunList['statusCounts'];
  onChange: (status: string) => void;
}) {
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : null;
  const chips: { status: string; label: string; count: number | null }[] = [
    { status: ANY_STATUS, label: 'Every status', count: total },
    ...RUN_STATUSES.map((status) => ({ status, label: status, count: counts ? (counts[status] ?? 0) : null })),
  ];

  return (
    <div role="group" aria-label="Filter runs by status" className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <Button
          key={chip.status}
          size="sm"
          variant={chip.status === value ? 'default' : 'outline'}
          aria-pressed={chip.status === value}
          onClick={() => onChange(chip.status)}
        >
          {chip.label}
          {chip.count !== null && (
            <span className="font-mono tabular-nums opacity-80" data-testid={`count-${chip.status}`}>
              {chip.count}
            </span>
          )}
        </Button>
      ))}
    </div>
  );
}

/** What the retention sweep keeps, when the API says. Silent about a window it does not know. */
function RetentionNote({ list }: { list: WorkflowRunList }) {
  const succeeded = formatMoment(list.succeededRetainedFrom);
  const failed = formatMoment(list.failedRetainedFrom);
  if (!succeeded && !failed) return null;

  return (
    <p className="text-muted-foreground mt-3 text-[12px]">
      Older runs are removed.
      {succeeded && ` Succeeded runs that finished before ${succeeded} are gone.`}
      {failed && ` Failed, partly failed and cancelled runs before ${failed} are gone.`}
    </p>
  );
}

/** Said when the list is not updating by itself, with when it last did. Text only. */
function PauseNote({ pause, updatedAt }: { pause: LivePause; updatedAt: number }) {
  const when = updatedAt > 0 ? new Date(updatedAt).toLocaleTimeString() : null;
  return (
    <p role="status" className="text-muted-foreground mt-3 text-[12px]">
      Live updates paused{pause.reason === 'stopped' ? ' (sign in again or ask for access to resume)' : ' (retrying)'}.
      {when && ` Last updated ${when}.`}
    </p>
  );
}

function RunFailureKind({ run }: { run: WorkflowRun }) {
  const kind = runFailureKind(run);
  if (!kind) return null;

  return (
    <StatusBadge tone={FAILURE_KINDS[kind].tone} dot={false}>
      {FAILURE_KINDS[kind].label}
    </StatusBadge>
  );
}

export default function WorkflowRunsPage() {
  const [status, setStatus] = useState<string>(ANY_STATUS);
  const [page, setPage] = useState(1);
  const searchParams = useSearchParams();
  const linked = searchParams.get('run');
  // An id in the address that is not shaped like a run id is answered with "not found" here. The
  // API would answer 400 to it, and there is nothing to ask.
  const [selectedId, setSelectedId] = useState<string | null>(linked ? parseRunId(linked) : null);
  const [badLink, setBadLink] = useState(!!linked && parseRunId(linked) === null);
  const [refreshing, setRefreshing] = useState(false);

  // A link from another page, or the address bar, picks the run. Picking one here writes it back,
  // so the address can be shared.
  const [seenLink, setSeenLink] = useState(linked);
  if (seenLink !== linked) {
    setSeenLink(linked);
    setBadLink(!!linked && parseRunId(linked) === null);
    setSelectedId(linked ? parseRunId(linked) : null);
  }

  // Put the canonical id in the address when the link spelled it another way.
  const canonical = linked ? parseRunId(linked) : null;
  useEffect(() => {
    if (!canonical || canonical === linked) return;
    const next = new URLSearchParams(window.location.search);
    next.set('run', canonical);
    window.history.replaceState(null, '', `${window.location.pathname}?${next.toString()}${window.location.hash}`);
  }, [canonical, linked]);

  function select(id: string) {
    setSelectedId(id);
    setBadLink(false);
    const next = new URLSearchParams(window.location.search);
    next.set('run', id);
    window.history.replaceState(null, '', `${window.location.pathname}?${next.toString()}${window.location.hash}`);
  }

  const access = useAccess();
  const canRetry = access.can(RUN_CAPABILITIES.retry, RUN_LEGACY_ROLES);
  const canAbandon = access.can(RUN_CAPABILITIES.abandon, RUN_LEGACY_ROLES);
  const canCancel = access.can(RUN_CAPABILITIES.cancel, RUN_LEGACY_ROLES);

  const runs = useWorkflowRuns({ page, pageSize: 25, status }, { live: true });
  const run = useWorkflowRun(selectedId);
  const retry = useRetryAttempt();
  const cancel = useCancelRun();
  const abandon = useAbandonRun();

  const rows = runs.data?.items ?? [];

  // A ref, not `retry.isPending`. The second click of a double click arrives before React has
  // rendered the pending state, and a button in a closing dialog never reads it at all, so only a
  // flag set in the same tick as the first click stops the second request.
  const retryInFlight = useRef(false);

  async function onRetry(ordinal: number) {
    if (!selectedId || retryInFlight.current) return;
    retryInFlight.current = true;

    try {
      await retry.mutateAsync({ runId: selectedId, ordinal });
      toast.success('Queued that action to run again.');
    } catch (error) {
      // A 409 lands here, which is the guard working rather than the button breaking: the runner
      // claimed the attempt while the operator was reading. The endpoint's wording says so.
      toast.error(apiErrorMessage(error));
    } finally {
      retryInFlight.current = false;
    }
  }

  async function onCancel(runId: string) {
    try {
      await cancel.mutateAsync(runId);
      toast.success('Run cancelled. An action already out finishes and is recorded.');
    } catch (error) {
      // 409 when the run finished first, or the runner wrote it at the same moment.
      toast.error(apiErrorMessage(error, 'The run could not be cancelled.'));
    }
  }

  async function onAbandon(runId: string) {
    try {
      await abandon.mutateAsync(runId);
      toast.success('Run abandoned. What went out is being undone.');
    } catch (error) {
      // 409 carries the reason: an action running now, nothing that succeeded, already rolled back.
      toast.error(apiErrorMessage(error, 'The run could not be abandoned.'));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflow runs"
        description="Every firing of a workflow, newest first. Open one to see what each of its actions did."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => {
                setRefreshing(true);
                void Promise.all([runs.refetch(), selectedId ? run.refetch() : null]).finally(() =>
                  setRefreshing(false),
                );
              }}
            >
              <IconRefresh />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className={CARD}>
          <h2 className="text-[15px] font-bold">Runs</h2>
          <div className="mt-3">
            <StatusChips
              value={status}
              counts={runs.data?.statusCounts}
              onChange={(next) => {
                setStatus(next);
                // Page 3 of "everything" is rarely page 3 of one status, and staying there shows an
                // empty list for a filter that has matches.
                setPage(1);
              }}
            />
          </div>

          {runs.pause && <PauseNote pause={runs.pause} updatedAt={runs.dataUpdatedAt} />}

          {runs.isLoading ? (
            <div className="mt-4">
              <TableSkeleton rows={6} />
            </div>
          ) : runs.isError ? (
            <ErrorState
              className="mt-4"
              entity="workflow runs"
              error={runs.error}
              onRetry={() => void runs.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              className="mt-4"
              icon={IconWorkflows}
              title="No runs to show"
              description={
                status === ANY_STATUS
                  ? 'Nothing has fired a workflow yet. A run appears here the moment one does.'
                  : `No run is currently ${status}. Try another status.`
              }
            />
          ) : (
            <>
              <Table className="mt-4">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-0">
                      <span className="sr-only">Open</span>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className={row.id === selectedId ? 'bg-accent' : undefined}>
                      <TableCell>
                        {/* A radio rather than a click on the row. The choice is one run out of
                            several, and a row that only answers a mouse cannot be opened from the
                            keyboard. */}
                        <input
                          type="radio"
                          name="run"
                          aria-label={`Open the ${row.workflowName} run started ${formatMoment(row.createdAt)}`}
                          checked={row.id === selectedId}
                          onChange={() => select(row.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge tone={toneForRunStatus(row.status)}>{row.status}</StatusBadge>
                          <RunFailureKind run={row} />
                        </div>
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-[13px] font-bold">
                        {row.workflowName}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-32 truncate font-mono text-[12px]">
                        {row.triggerEvent}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[12px] whitespace-nowrap">
                        {formatMoment(row.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {runs.data && <PaginationControls page={runs.data} onPageChange={setPage} />}
              {runs.data && <RetentionNote list={runs.data} />}
            </>
          )}
        </section>

        <section className={CARD}>
          {badLink ? (
            <EmptyState
              icon={IconWorkflows}
              title="Run not found"
              description="That is not a run id. Check the link."
            />
          ) : !selectedId ? (
            <EmptyState
              icon={IconWorkflows}
              title="Choose a run"
              description="Its actions appear here in the order they execute, with what each one did and whether it can be retried."
            />
          ) : run.isLoading ? (
            <TableSkeleton rows={4} />
 ) : run.isError && isNotFound(run.error) ? (
            <EmptyState
              icon={IconWorkflows}
              title="Run not found"
              description="No run has that id. It may have been removed by the retention sweep, or the link is wrong."
            />
          ) : run.isError ? (
            <ErrorState entity="that run" error={run.error} onRetry={() => void run.refetch()} />
          ) : run.data ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-bold">{run.data.workflowName}</h2>
                <StatusBadge tone={toneForRunStatus(run.data.status)}>{run.data.status}</StatusBadge>
                {canCancel && isCancellable(run.data) && (
                  <ConfirmDialog
                    trigger={
                      <Button className="ml-auto" size="sm" variant="outline" disabled={cancel.isPending}>
                        {cancel.isPending ? 'Cancelling...' : 'Cancel run'}
                      </Button>
                    }
                    title={`Cancel this ${run.data.workflowName} run?`}
                    description="Actions that have not started will not run. One already out finishes and its outcome is kept. A cancelled run cannot be retried."
                    confirmLabel="Yes, cancel the run"
                    destructive
                    onConfirm={() => void onCancel(run.data!.id)}
                  />
                )}
                {canAbandon && isAbandonable(run.data) && (
                  <ConfirmDialog
                    trigger={
                      <Button
                        className={isCancellable(run.data) && canCancel ? undefined : 'ml-auto'}
                        size="sm"
                        variant="outline"
                        disabled={abandon.isPending}
                      >
                        {abandon.isPending ? 'Abandoning...' : 'Abandon run'}
                      </Button>
                    }
                    title={`Abandon this ${run.data.workflowName} run?`}
                    description="Nothing in it runs again. What already went out is undone by the compensation each action declares, and an action that declares none is reported as not undone."
                    confirmLabel="Yes, abandon the run"
                    destructive
                    onConfirm={() => void onAbandon(run.data!.id)}
                  />
                )}
              </div>

              <RunFacts run={run.data} />

              <h3 className="mt-6 text-[13px] font-bold">Actions</h3>
              {run.data.actions.length === 0 ? (
                <p className="text-muted-foreground mt-1 text-[13px]">
                  This run carried no actions, so it completed with nothing to do.
                </p>
              ) : (
                <ol aria-label="Actions" className="mt-3 space-y-3">
                  {run.data.actions.map((attempt) => (
                    <AttemptCard
                      key={attempt.ordinal}
                      attempt={attempt}
                      retrying={retry.isPending}
                      canRetry={canRetry && runAllowsRetry(run.data!)}
                      onRetry={(ordinal) => void onRetry(ordinal)}
                    />
                  ))}
                </ol>
              )}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
