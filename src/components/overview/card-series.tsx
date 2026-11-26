'use client';

import { useState } from 'react';
import { Sparkline } from '@/components/analytics/sparkline';
import type { ModuleCardSeries } from '@/lib/module-cards';

const number = new Intl.NumberFormat();

/**
 * A daily chart with the previous window dashed behind it. Hovering or focusing a day shows its
 * numbers, and a visually hidden table carries the same numbers for screen readers.
 */
export function CardSeries({ series }: { series: ModuleCardSeries }) {
  const [active, setActive] = useState<number | null>(null);
  const { points } = series;
  const hasPrevious = points.some((p) => p.previous !== undefined);
  const current = active === null ? null : points[active];

  return (
    <div data-testid="card-series" className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-muted-foreground text-xs font-medium">{series.label}</h3>
        {series.previousLabel && hasPrevious && (
          <p className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="bg-primary h-0.5 w-4 rounded" aria-hidden />
              {series.label}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="border-muted-foreground h-0 w-4 border-t-2 border-dashed" aria-hidden />
              {series.previousLabel}
            </span>
          </p>
        )}
      </div>
      <div className="relative">
        <Sparkline
          values={points.map((p) => p.value)}
          previous={hasPrevious ? points.map((p) => p.previous ?? 0) : undefined}
          height={96}
        />
        <div className="absolute inset-0 flex">
          {points.map((point, i) => (
            <button
              type="button"
              key={point.date}
              aria-label={`${point.date}: ${number.format(point.value)}`}
              className="focus-visible:ring-ring h-full flex-1 rounded-sm outline-none focus-visible:ring-2"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
          ))}
        </div>
        {current && (
          <p
            role="status"
            data-testid="card-series-tip"
            className="bg-card border-border absolute top-0 right-0 rounded-lg border px-2.5 py-1.5 text-xs shadow-sm"
          >
            <span className="font-medium">{current.date}</span>
            <span className="block">
              {series.label}: {number.format(current.value)}
            </span>
            {current.previous !== undefined && (
              <span className="text-muted-foreground block">
                {series.previousLabel ?? 'Before'}: {number.format(current.previous)}
              </span>
            )}
          </p>
        )}
      </div>
      <table className="sr-only">
        <caption>{series.label}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{series.label}</th>
            {hasPrevious && <th scope="col">{series.previousLabel ?? 'Before'}</th>}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.date}</th>
              <td>{number.format(point.value)}</td>
              {hasPrevious && <td>{point.previous === undefined ? '' : number.format(point.previous)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
