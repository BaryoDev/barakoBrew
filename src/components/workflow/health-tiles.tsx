'use client';

import { healthTile, type WorkflowHealth } from '@/hooks/use-workflow-health';
import { formatDuration } from '@/hooks/use-workflow-runs';

/**
 * Three figures for one workflow over the health window: finished runs, how many succeeded, and the
 * average action time. Nothing at all when there is no health answer for it.
 */
export function HealthTiles({ health, windowDays }: { health: WorkflowHealth | undefined; windowDays?: number }) {
  const tile = healthTile(health);
  if (!health || tile.kind === 'none') return null;

  const window = windowDays ? `last ${windowDays} days` : undefined;
  const figures: { label: string; value: string; note?: string }[] = [
    { label: 'Runs here', value: String(health.finishedRuns), note: window },
    { label: 'Succeeded %', value: tile.kind === 'rate' ? `${tile.percent}%` : 'No runs yet' },
    {
      label: 'Avg. action',
      value: health.averageActionDurationMs == null ? 'Not recorded' : formatDuration(health.averageActionDurationMs),
    },
  ];

  return (
    <dl aria-label="Workflow health" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {figures.map((figure) => (
        <div key={figure.label} className="rounded-lg border px-4 py-3">
          <dt className="text-muted-foreground text-xs">{figure.label}</dt>
          <dd className="font-mono text-lg font-medium tabular-nums">{figure.value}</dd>
          {figure.note && <dd className="text-muted-foreground text-xs">{figure.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
