'use client';

/** A tiny dependency-free area/line chart for a single series. Scales to its container width. */
export function Sparkline({
  values,
  previous,
  labels,
  height = 56,
  className,
}: {
  values: number[];
  /** The window before this one, drawn dashed behind the current line on the same scale. */
  previous?: number[];
  labels?: string[];
  height?: number;
  className?: string;
}) {
  const width = 600; // viewBox units; the SVG stretches to the container via preserveAspectRatio.
  if (values.length === 0) {
    return <div className={className} style={{ height }} />;
  }
  const max = Math.max(...values, ...(previous ?? []), 1);
  const n = values.length;
  const step = n > 1 ? width / (n - 1) : 0;
  const y = (v: number) => height - (v / max) * (height - 4) - 2;
  const path = (series: number[]) =>
    series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const line = path(values);
  const previousLine = previous && previous.length > 0 ? path(previous.slice(0, n)) : null;
  const area = `${line} L ${(width).toFixed(2)},${height} L 0,${height} Z`;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      role="img"
      aria-label={labels ? `Trend: ${values.join(', ')}` : 'Trend'}
    >
      <path d={area} className="fill-primary/10" />
      {previousLine && (
        <path
          data-testid="previous-line"
          d={previousLine}
          className="stroke-muted-foreground"
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path d={line} className="stroke-primary" fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
