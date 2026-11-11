import { isRolledBack, isStopped, runFailureKind, type WorkflowRun } from '@/hooks/use-workflow-runs';

const CANCELLED = 'Cancelled. Actions that had not started did not run. A cancelled run cannot be retried.';

/**
 * What to tell the reader about the run in front of them, in the order the cases matter. An Unknown
 * action comes first: it is the one that asks a person to accept a risk, so its note says what the
 * idempotency key does and does not promise.
 */
export function runNote(run: Pick<WorkflowRun, 'status' | 'actions' | 'cancelledAt' | 'abandonedAt' | 'compensation'>): string {
  const unknown = run.actions.find((action) => action.status === 'Unknown');

  if (run.status === 'Running' || run.status === 'Pending') {
    return 'Live. This view follows the runner as it writes the run. An action that fails with a temporary error is attempted again on its own, with backoff, before anyone is asked.';
  }
  // The API refuses every retry on a stopped or rolled back run, so none of the notes below that
  // invite one is said here.
  if (isRolledBack(run)) return 'Rolled back or abandoned. Its actions are not retried.';
  if (isStopped(run)) return CANCELLED;
  if (unknown) {
    return `The ${unknown.actionType} request timed out, so it may already have gone out. A retry sends the same idempotency key, so a receiver that honours it drops the duplicate. Accepting that risk is a decision only a person can make.`;
  }
  if (run.status === 'PartiallyFailed') {
    return 'Some actions already went out, so this is not a plain failure. Retrying the failed action continues the run from there. The ones that succeeded are not sent again.';
  }
  if (run.status === 'Failed' && runFailureKind(run) === 'permanent') {
    return 'A permanent failure will not fix itself by retrying. Fix the cause first. A retry then asks you to confirm.';
  }
  if (run.status === 'Succeeded') {
    return 'Every action succeeded. Nothing can be retried, because sending a succeeded action again is the duplicate the idempotency key exists to prevent.';
  }
  return 'A retry sends the same idempotency key as the first try, so a receiver that honours it does not act twice.';
}

export function RunNote({ run }: { run: Parameters<typeof runNote>[0] }) {
  return (
    <p data-testid="run-note" className="bg-secondary text-muted-foreground mt-4 rounded-xl p-3.5 text-[13px] leading-relaxed">
      {runNote(run)}
    </p>
  );
}
