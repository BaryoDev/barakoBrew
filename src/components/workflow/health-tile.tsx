'use client';

import { StatusBadge } from '@/components/patterns/status-badge';
import { healthTile, type WorkflowHealth } from '@/hooks/use-workflow-health';
import { toneForRunStatus } from '@/hooks/use-workflow-runs';

/**
 * One workflow's health: no runs yet, a rate with the sample it was taken over, or nothing at all
 * when there is no answer to show (the call failed, or this API has no health route).
 */
export function HealthTile({ health, windowDays }: { health: WorkflowHealth | undefined; windowDays?: number }) {
  const tile = healthTile(health);
  if (tile.kind === 'none') return null;

  if (tile.kind === 'no-runs') {
    return <span className="text-muted-foreground text-xs">No runs yet</span>;
  }

  return (
    <div className="space-y-1">
      <p className="text-sm">
        <span className="font-mono font-medium tabular-nums">{tile.percent}%</span>{' '}
        <span className="text-muted-foreground text-xs">
          ({tile.succeeded} of {tile.finished}
          {windowDays ? `, last ${windowDays} days` : ''})
        </span>
      </p>
      {health && health.lastOutcomes.length > 0 && (
        <ul aria-label="Last outcomes" className="flex flex-wrap gap-1">
          {health.lastOutcomes.slice(0, 5).map((outcome) => (
            <li key={outcome.runId}>
              <StatusBadge tone={toneForRunStatus(outcome.status)} dot={false}>
                {outcome.status}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
