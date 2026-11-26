import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { ModuleCardStat } from '@/lib/module-cards';
import { cn } from '@/lib/utils';

const number = new Intl.NumberFormat();

function formatValue(stat: ModuleCardStat): string {
  const text = number.format(stat.value);
  return stat.format === 'percent' ? `${text}%` : text;
}

/** The change from the previous window as a whole percent, or null when there is nothing to compare. */
function change(stat: ModuleCardStat): number | null {
  if (stat.previous === undefined || !(stat.previous > 0)) return null;
  const percent = Math.round(((stat.value - stat.previous) / stat.previous) * 100);
  return Number.isFinite(percent) ? percent : null;
}

function changeTone(stat: ModuleCardStat, delta: number): string {
  if (!stat.goodWhen || delta === 0) return 'text-muted-foreground';
  return (delta > 0) === (stat.goodWhen === 'up') ? 'text-success' : 'text-destructive';
}

/** Stat tiles: a label, a value, and the change from the previous window when there is one. */
export function CardStats({ stats }: { stats: ModuleCardStat[] }) {
  return (
    <ul data-testid="card-stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat, i) => {
        const delta = change(stat);
        const Icon = delta === null ? null : delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
        return (
          <li key={i} className="bg-secondary grid content-start gap-1 rounded-xl px-3 py-2.5">
            <span className="text-muted-foreground text-xs">{stat.label}</span>
            <span className="font-display text-2xl leading-none font-semibold tracking-[-0.02em]">
              {formatValue(stat)}
              {stat.total !== undefined && (
                <span className="text-muted-foreground text-sm font-normal"> of {number.format(stat.total)}</span>
              )}
            </span>
            {delta !== null && Icon && (
              <span className={cn('flex items-center gap-1 text-xs font-medium', changeTone(stat, delta))}>
                <Icon className="size-3" aria-hidden />
                <span className="sr-only">{delta > 0 ? 'Up' : delta < 0 ? 'Down' : 'No change'}</span>
                {delta > 0 ? '+' : ''}
                {delta}%
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
