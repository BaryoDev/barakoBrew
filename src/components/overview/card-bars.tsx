import type { ModuleCardBars } from '@/lib/module-cards';

const number = new Intl.NumberFormat();

/** Horizontal bars in one hue, each as long as its value is against the largest. */
export function CardBars({ bars }: { bars: ModuleCardBars }) {
  const largest = Math.max(0, ...bars.items.map((item) => item.value));
  return (
    <div data-testid="card-bars" className="grid gap-2">
      <h3 className="text-muted-foreground text-xs font-medium">{bars.label}</h3>
      <ul className="grid gap-1.5">
        {bars.items.map((item, i) => {
          const width = largest > 0 ? Math.round((item.value / largest) * 100) : 0;
          return (
            <li key={i} className="grid gap-1 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{item.label}</span>
                <span className="font-medium tabular-nums">{number.format(item.value)}</span>
              </div>
              <div className="bg-secondary h-1.5 rounded-full" aria-hidden>
                <div data-testid="card-bar" className="bg-primary h-full rounded-full" style={{ width: `${width}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
