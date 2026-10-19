'use client';

import { useRef } from 'react';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Button } from '@/components/ui/button';
import { IconRefresh } from '@/components/icons';
import {
  FAILURE_KINDS,
  failureKind,
  formatDuration,
  isRetryable,
  toneForAttemptStatus,
  type ActionCompensation,
  type AttemptEntry,
  type WorkflowActionAttempt,
} from '@/hooks/use-workflow-runs';

/** A timestamp in the reader's locale, or nothing at all. A row for a date nobody has is noise. */
function formatMoment(value: string | null | undefined): string {
  if (!value) return '';
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleString();
}

interface AttemptCardProps {
  attempt: WorkflowActionAttempt;
  onRetry: (ordinal: number) => void;
  /**
   * True while a retry is in flight anywhere in the run. It disables the button once React has
   * rendered it, which is too late for the second click of a double click, so the page's `onRetry`
   * also refuses a retry while one is in flight.
   */
  retrying: boolean;
  /** False on a stopped run, where the API refuses every retry. */
  canRetry?: boolean;
}

/**
 * The rest of the props go onto the button, because the dialog hands its trigger a click handler
 * and a ref of its own.
 */
function RetryButton({
  attempt,
  retrying,
  ...props
}: Pick<AttemptCardProps, 'attempt' | 'retrying'> & React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      className="ml-auto"
      size="sm"
      variant="outline"
      disabled={retrying}
      aria-label={`Retry action ${attempt.ordinal}, ${attempt.actionType}`}
    >
      <IconRefresh />
      {retrying ? 'Queueing...' : 'Retry'}
    </Button>
  );
}

/**
 * One action of a run: what it was, how it went, and the retry button when retrying it is safe.
 *
 * The button's presence is `isRetryable` and nothing else, which is why that lives in the hook with
 * its own tests. Offering it on a succeeded action is the hazard the idempotency key was added for.
 *
 * A failure the API calls permanent keeps the button and asks first. The request it then sends is
 * the same one: the server works out for its audit entry whether the failure was permanent.
 */
export function AttemptCard({ attempt, onRetry, retrying, canRetry = true }: AttemptCardProps) {
  const facts: { label: string; value: string }[] = [
    { label: 'Attempts', value: String(attempt.attempts) },
    { label: 'Took', value: formatDuration(attempt.durationMs) },
  ];

  if (attempt.responseStatus !== null && attempt.responseStatus !== undefined) {
    facts.push({ label: 'Response', value: String(attempt.responseStatus) });
  }

  const finished = formatMoment(attempt.completedAt);
  if (finished) facts.push({ label: 'Finished', value: finished });

  const next = formatMoment(attempt.nextAttemptAt);
  if (next) facts.push({ label: 'Next attempt', value: next });

  if (attempt.onFailure === 'Halt') facts.push({ label: 'If it fails', value: 'Stops the run' });
  if (typeof attempt.haltedBy === 'number') {
    // Retrying this one is refused; retrying the action that halted the run queues it again.
    facts.push({ label: 'Skipped because', value: `action ${attempt.haltedBy} failed` });
  }

  if (attempt.compensation) facts.push({ label: 'Undo', value: undoText(attempt.compensation) });
  const outputs = Object.keys(attempt.outputs ?? {});
  if (outputs.length > 0) facts.push({ label: 'Kept outputs', value: outputs.join(', ') });

  const kind = failureKind(attempt);

  // One retry for each time the question is asked. "Retry anyway" stays on screen and pressable
  // while the dialog animates out, so a second press, or a held Enter, would otherwise retry again
  // once a quick answer had cleared the page's in-flight flag.
  const asked = useRef(false);

  function onConfirmed() {
    if (!asked.current) return;
    asked.current = false;
    onRetry(attempt.ordinal);
  }

  function onAsk() {
    asked.current = true;
  }

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground font-mono text-[12px] font-bold tabular-nums">
          {attempt.ordinal}
        </span>
        <span className="text-[13px] font-bold">{attempt.actionType}</span>
        <StatusBadge tone={toneForAttemptStatus(attempt.status)}>{attempt.status}</StatusBadge>

        {kind && (
          <StatusBadge tone={FAILURE_KINDS[kind].tone} dot={false}>
            {FAILURE_KINDS[kind].label}
          </StatusBadge>
        )}

        {canRetry && isRetryable(attempt) &&
          (kind === 'permanent' ? (
            <ConfirmDialog
              trigger={<RetryButton attempt={attempt} retrying={retrying} onClick={onAsk} />}
              title={`Retry action ${attempt.ordinal}, ${attempt.actionType}?`}
              description="This failure will not fix itself by retrying. Retry anyway?"
              confirmLabel="Retry anyway"
              onConfirm={onConfirmed}
            />
          ) : (
            <RetryButton attempt={attempt} retrying={retrying} onClick={() => onRetry(attempt.ordinal)} />
          ))}
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className="font-mono tabular-nums">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {showsHistory(attempt) ? (
        <TryList attempt={attempt} />
      ) : (
        attempt.error && (
        <pre className="bg-muted mt-3 max-h-40 overflow-auto rounded-md p-3 text-[12px] whitespace-pre-wrap">
          {attempt.error}
        </pre>
        )
      )}
    </li>
  );
}

/** How this action's undoing went: what undid it and how, or that nothing undoes it, with any error. */
export function undoText(compensation: ActionCompensation): string {
  const outcome =
    compensation.status === 'NotDeclared'
      ? 'Nothing undoes it'
      : compensation.actionType
        ? `${compensation.actionType}, ${compensation.status}`
        : compensation.status;
  return compensation.error ? `${outcome}: ${compensation.error}` : outcome;
}

/**
 * Whether the card lists every try. A single try is what the fields above already say, and the API
 * builds one for a run stored before it kept history, so listing it would only say it twice. More
 * than one try, or tries dropped to stay within the cap, is what the list is for.
 */
export function showsHistory(attempt: Pick<WorkflowActionAttempt, 'history' | 'droppedAttempts'>): boolean {
  return (attempt.history?.length ?? 0) > 1 || (attempt.droppedAttempts ?? 0) > 0;
}

function tryFacts(entry: AttemptEntry): string {
  const parts: string[] = [];
  if (entry.responseStatus !== null && entry.responseStatus !== undefined) parts.push(String(entry.responseStatus));
  if (entry.durationMs !== null && entry.durationMs !== undefined) parts.push(formatDuration(entry.durationMs));
  const started = formatMoment(entry.startedAt);
  if (started) parts.push(started);
  return parts.join(', ');
}

/**
 * Every try of the action, oldest first as the API sends them. The error is text: it came from a
 * remote system, so it is never given to anything that reads markup.
 */
function TryList({ attempt }: { attempt: WorkflowActionAttempt }) {
  const dropped = attempt.droppedAttempts ?? 0;

  return (
    <div className="mt-3">
      <h4 className="text-[12px] font-bold">Tries</h4>
      {dropped > 0 && (
        <p className="text-muted-foreground mt-1 text-[12px]">
          {dropped === 1 ? '1 earlier try is' : `${dropped} earlier tries are`} no longer kept.
        </p>
      )}
      <ol aria-label={`Tries of action ${attempt.ordinal}`} className="mt-1 space-y-2">
        {(attempt.history ?? []).map((entry) => (
          <li key={entry.number} className="rounded-md border p-2 text-[12px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold tabular-nums">Try {entry.number}</span>
              <StatusBadge tone={toneForAttemptStatus(entry.outcome)}>{entry.outcome}</StatusBadge>
              <span className="text-muted-foreground font-mono tabular-nums">{tryFacts(entry)}</span>
            </div>
            {entry.error && (
              <pre className="bg-muted mt-2 max-h-32 overflow-auto rounded-md p-2 whitespace-pre-wrap">
                {entry.error}
              </pre>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
