import { cn } from '@/lib/utils';
import type { WorkflowActionAttempt } from '@/hooks/use-workflow-runs';

type Step = Pick<WorkflowActionAttempt, 'status' | 'nextAttemptAt'>;

/** The fill of one segment. A failed action waiting to be tried again is warning, not danger. */
export function segmentTone(step: Step): string {
  switch (step.status) {
    case 'Succeeded':
      return 'bg-success';
    case 'Failed':
      return step.nextAttemptAt ? 'bg-warning' : 'bg-destructive';
    case 'Unknown':
      return 'bg-warning';
    case 'Running':
      return 'bg-primary';
    default:
      return 'bg-border';
  }
}

/** What the strip says to a reader who cannot see its colours. */
export function progressSummary(steps: readonly Step[]): string {
  const counts = new Map<string, number>();
  for (const step of steps) counts.set(step.status, (counts.get(step.status) ?? 0) + 1);
  const parts = [...counts].map(([status, n]) => `${n} ${status.toLowerCase()}`);
  return `${steps.length} ${steps.length === 1 ? 'action' : 'actions'}: ${parts.join(', ')}`;
}

/** One bar per action of a run, coloured by how that action went. Nothing for a run with no actions. */
export function RunProgressStrip({ actions, className }: { actions: readonly Step[] | undefined; className?: string }) {
  if (!actions?.length) return null;

  return (
    <span role="img" aria-label={progressSummary(actions)} className={cn('flex shrink-0 gap-[3px]', className)}>
      {actions.map((step, i) => (
        <span key={i} data-testid="progress-segment" className={cn('h-1.5 w-4 rounded-[3px]', segmentTone(step))} />
      ))}
    </span>
  );
}
