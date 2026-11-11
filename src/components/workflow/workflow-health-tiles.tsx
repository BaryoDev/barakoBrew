import { healthTile, type WorkflowHealth } from '@/hooks/use-workflow-health';
import { formatDuration } from '@/hooks/use-workflow-runs';
import { cn } from '@/lib/utils';

const NONE = 'n/a';

/** The average action time in the short form the design uses: "108 ms", "1.2 s". Nothing when the API sends none. */
export function averageAction(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return NONE;
  return formatDuration(ms);
}

/**
 * Runs here, Succeeded and Avg. action for one workflow, from the health read. Runs here is the
 * count of finished runs in the health window, since that is the count the API gives.
 */
export function WorkflowHealthTiles({ health, windowDays }: { health: WorkflowHealth | undefined; windowDays?: number }) {
  const tile = healthTile(health);
  const succeeded = tile.kind === 'rate' ? `${tile.percent}%` : NONE;
  const tiles: { label: string; value: string; tone?: string }[] = [
    { label: 'Runs here', value: health ? String(health.finishedRuns) : NONE },
    { label: 'Succeeded', value: succeeded, tone: tile.kind === 'rate' ? (tile.percent === 100 ? 'text-success' : 'text-warning') : undefined },
    { label: 'Avg. action', value: averageAction(health?.averageActionDurationMs) },
  ];

  return (
    <div className="grid grid-cols-3 gap-2" aria-label={windowDays ? `Health, last ${windowDays} days` : 'Health'} role="group">
      {tiles.map((item) => (
        <div key={item.label} className="bg-background border-border grid gap-0.5 rounded-xl border px-3.5 py-3">
          <span className="text-muted-foreground text-[12px]">{item.label}</span>
          <span className={cn('font-display text-[22px] font-semibold tracking-[-0.02em] tabular-nums', item.tone)}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
