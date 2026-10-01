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
export function AttemptCard({ attempt, onRetry, retrying }: AttemptCardProps) {
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

        {isRetryable(attempt) &&
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

      {attempt.error && (
        <pre className="bg-muted mt-3 max-h-40 overflow-auto rounded-md p-3 text-[12px] whitespace-pre-wrap">
          {attempt.error}
        </pre>
      )}
    </li>
  );
}
