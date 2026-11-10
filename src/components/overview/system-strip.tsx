'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useApiMeta } from '@/hooks/use-meta';
import { useHealthStatus } from '@/hooks/use-monitoring';
import { useNavMetrics } from '@/hooks/use-nav-metrics';
import { useRunSample } from '@/hooks/use-overview';
import { hrefsOf, useAllowedGroups } from '@/hooks/use-visible-hrefs';
import { durationMs, runnerState, systemVerdict, type Tone } from '@/lib/overview';
import { cn } from '@/lib/utils';

type Dot = Tone | 'accent' | 'none';

export const DATABASE_WORDS = ['postgres', 'database', 'marten', 'db'];
export const STORAGE_WORDS = ['storage', 'seaweed', 's3', 'file'];

function dotFor(status?: string): Dot {
  if (status === 'Healthy') return 'ok';
  if (status === 'Degraded') return 'warn';
  if (!status) return 'none';
  return 'bad';
}

/** Health entries are named by the API; match the database and storage checks by name. */
export function findHealthEntry<T extends { status: string }>(entries: Record<string, T> | undefined, words: string[]) {
  if (!entries) return undefined;
  const key = Object.keys(entries).find((name) => words.some((w) => name.toLowerCase().includes(w)));
  return key ? entries[key] : undefined;
}

const PILL: Record<Tone, string> = {
  ok: 'bg-(--success-soft) text-success',
  warn: 'bg-(--warning-soft) text-warning',
  bad: 'bg-(--danger-soft) text-destructive',
};

interface StripItem {
  key: string;
  label: string;
  dot: Dot;
  value: React.ReactNode;
  tip?: string;
  /** Where it opens. Left out when the caller cannot reach that screen. */
  href?: string;
}

function Item({ item }: { item: StripItem }) {
  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          'size-[7px] rounded-full',
          item.dot === 'ok' && 'bg-success',
          item.dot === 'warn' && 'bg-warning pulse',
          item.dot === 'bad' && 'bg-destructive pulse',
          item.dot === 'accent' && 'bg-primary',
          item.dot === 'none' && 'bg-(--faint)',
        )}
      />
      <b className="text-foreground font-semibold">{item.label}</b>
      {item.value}
    </>
  );
  const className = 'text-secondary-foreground flex items-center gap-1.5 py-1 text-[12.5px]';
  return item.href ? (
    <Link href={item.href} title={item.tip} className={cn(className, 'hover:text-foreground rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50')}>
      {body}
    </Link>
  ) : (
    <span title={item.tip} className={className}>
      {body}
    </span>
  );
}

/**
 * A verdict pill, then API, Database, Storage, Mail and Runner. Each part shows a dash or Unknown
 * when its own call failed or the API does not send it, so one failing read never blanks the strip.
 * Mail and Runner are left out when their data is not there: Mail needs the email events the caller
 * may read, and the Runner is read from the newest runs.
 */
export function SystemStrip() {
  const meta = useApiMeta();
  const health = useHealthStatus();
  const allowed = useAllowedGroups();
  const visible = useMemo(() => hrefsOf(allowed), [allowed]);
  const metrics = useNavMetrics(useMemo(() => new Set(['/email-events'].filter((h) => visible.has(h))), [visible]));
  const runs = useRunSample();
  const database = findHealthEntry(health.data?.entries, DATABASE_WORDS);
  const storage = findHealthEntry(health.data?.entries, STORAGE_WORDS);
  const latency = durationMs(database?.duration);
  const link = (href: string) => (visible.has(href) ? href : undefined);

  const items: StripItem[] = [
    {
      key: 'api',
      label: 'API',
      dot: meta.data?.version ? 'ok' : 'none',
      value: <span className="font-mono text-xs">{meta.data?.version ? `up · ${meta.data.version}` : '—'}</span>,
      href: '/ops/health',
    },
    {
      key: 'database',
      label: 'Database',
      dot: dotFor(database?.status),
      value: (
        <>
          <span>{database?.status ?? 'Unknown'}</span>
          {latency != null && <span className="font-mono text-xs">· {latency} ms</span>}
        </>
      ),
      href: '/ops/health',
    },
    {
      key: 'storage',
      label: 'Storage',
      dot: dotFor(storage?.status),
      value: <span>{storage?.status ?? 'Unknown'}</span>,
      href: link('/settings/storage'),
    },
  ];

  const bounces = metrics.recentBounces;
  if (bounces) {
    const n = `${bounces.value}${bounces.atLeast ? '+' : ''}`;
    items.push({
      key: 'mail',
      label: 'Mail',
      dot: bounces.value > 0 ? 'warn' : 'ok',
      value: <span>{bounces.value > 0 ? `${n} ${bounces.value === 1 ? 'bounce' : 'bounces'}` : 'delivering'}</span>,
      tip: 'Bounces in the last 24 hours',
      href: link('/email-events'),
    });
  }

  if (runs.data) {
    const state = runnerState(runs.data.rows as readonly { status?: unknown }[]);
    items.push({
      key: 'runner',
      label: 'Runner',
      dot: state === 'idle' ? 'ok' : 'accent',
      value: <span>{state}</span>,
      href: link('/workflow-runs'),
    });
  }

  const verdict = systemVerdict(items.map((item) => (item.dot === 'accent' ? 'ok' : item.dot)));

  return (
    <div
      aria-label="System status"
      role="group"
      className="bg-secondary flex flex-wrap items-center gap-x-3.5 gap-y-1 rounded-full py-1.5 pr-3.5 pl-1.5"
    >
      <Link
        href={bounces && bounces.value > 0 && visible.has('/email-events') ? '/email-events' : '/ops/health'}
        className={cn(
          'flex h-7 items-center gap-[7px] rounded-full px-[11px] text-[12.5px] font-semibold outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50',
          PILL[verdict.tone],
        )}
      >
        <span aria-hidden className="size-[7px] rounded-full bg-current" />
        {verdict.text}
      </Link>
      {items.map((item) => (
        <Item key={item.key} item={item} />
      ))}
    </div>
  );
}
