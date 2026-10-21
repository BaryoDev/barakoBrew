'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { IconArrowRight } from '@/components/icons';
import { useEntrySample, useRunSample } from '@/hooks/use-overview';
import { changeOver, sparkBars, type Change, type Range, type Sample } from '@/lib/overview';
import { cn } from '@/lib/utils';

export type StatTone = 'normal' | 'alert';

export interface StatCardProps {
  label: string;
  href: string;
  state: 'loading' | 'error' | 'ready';
  value?: number;
  /** Rows per slice of the range, oldest first. Empty or absent draws no bars. */
  bars?: readonly number[];
  change?: Change | null;
  /** Replaces the change figure, for the Failures card. */
  caption?: string;
  tone?: StatTone;
}

const BAR_MIN_PX = 4;
const BAR_SPAN_PX = 30;

function Spark({ bars, tone }: { bars: readonly number[]; tone: StatTone }) {
  const max = Math.max(...bars, 0);
  return (
    <span aria-hidden className="flex h-[34px] items-end gap-0.5" data-testid="spark">
      {bars.map((n, i) => {
        const last = i === bars.length - 1;
        const height = BAR_MIN_PX + (max > 0 ? (n / max) * BAR_SPAN_PX : 0);
        return (
          <span
            key={i}
            style={{ height }}
            className={cn(
              'w-[5px] rounded-[2px] transition-[height] duration-300',
              tone === 'alert' ? (last ? 'bg-destructive' : 'bg-destructive/25') : last ? 'bg-primary' : 'bg-primary/25',
            )}
          />
        );
      })}
    </span>
  );
}

export function StatCard({ label, href, state, value, bars, change, caption, tone = 'normal' }: StatCardProps) {
  const captionText = caption ?? change?.text;
  const captionClass =
    tone === 'alert'
      ? 'text-destructive'
      : change?.direction === 'down'
        ? 'text-destructive'
        : change?.direction === 'flat' || caption
          ? 'text-muted-foreground'
          : 'text-success';

  return (
    <Link
      href={href}
      className={cn(
        'group border-border bg-card text-card-foreground grid grid-cols-[1fr_auto] items-end gap-x-3 gap-y-2 rounded-2xl border p-[18px] outline-hidden',
        'hover-card rise',
        'focus-visible:ring-ring/50 focus-visible:ring-2',
      )}
    >
      <span className="text-muted-foreground col-span-full flex items-center justify-between text-[13px]">
        {label}
        <IconArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
      <span className="grid gap-1.5">
        {state === 'loading' ? (
          <Skeleton className="h-8 w-14" />
        ) : state === 'error' ? (
          <span className="font-display text-[32px] leading-none font-semibold" aria-hidden>
            {'—'}
          </span>
        ) : (
          <span className="font-display text-[32px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
            {value}
          </span>
        )}
        {state === 'error' ? (
          <span role="alert" className="text-destructive text-[12.5px] font-semibold">
            Could not load
          </span>
        ) : state === 'ready' && captionText ? (
          <span className={cn('text-[12.5px] font-semibold', captionClass)}>{captionText}</span>
        ) : (
          <span className="h-[18px]" />
        )}
      </span>
      {state === 'ready' && bars && bars.length > 0 ? <Spark bars={bars} tone={tone} /> : <span />}
    </Link>
  );
}

function fromSample(sample: Sample | undefined, range: Range, now: number) {
  if (!sample) return { bars: undefined, change: null };
  return { bars: sparkBars(sample.rows, range, now), change: changeOver(sample, range, now) };
}

/**
 * Published, Drafts, Workflow runs and Failures. Each card makes one bounded request (the newest
 * page of its list) and reads its total, sparkline and change figure from it, so one failing card
 * leaves the other three as they are.
 */
export function StatCards({ range, now: fixedNow }: { range: Range; now?: number }) {
  const [mounted] = useState(() => Date.now());
  const now = fixedNow ?? mounted;
  const published = useEntrySample('Published');
  const drafts = useEntrySample('Draft');
  const runs = useRunSample();
  const failures = useRunSample('Failed');

  const stateOf = (q: { isError: boolean; data: Sample | undefined }) =>
    q.isError ? 'error' : q.data ? 'ready' : 'loading';

  const pub = fromSample(published.data, range, now);
  const dra = fromSample(drafts.data, range, now);
  const run = fromSample(runs.data, range, now);
  const fail = fromSample(failures.data, range, now);
  const failed = failures.data?.totalItems ?? 0;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
      <StatCard
        label="Published"
        href="/content"
        state={stateOf(published)}
        value={published.data?.totalItems}
        bars={pub.bars}
        change={pub.change}
      />
      <StatCard
        label="Drafts"
        href="/content"
        state={stateOf(drafts)}
        value={drafts.data?.totalItems}
        bars={dra.bars}
        change={dra.change}
      />
      <StatCard
        label="Workflow runs"
        href="/workflow-runs"
        state={stateOf(runs)}
        value={runs.data?.totalItems}
        bars={run.bars}
        change={run.change}
      />
      <StatCard
        label="Failures"
        href="/workflow-runs"
        state={stateOf(failures)}
        value={failures.data?.totalItems}
        bars={fail.bars}
        caption={failed > 0 ? 'Needs you' : 'None'}
        tone={failed > 0 ? 'alert' : 'normal'}
      />
    </div>
  );
}
