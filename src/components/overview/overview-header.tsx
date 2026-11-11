'use client';

import { useAuth } from '@/hooks/use-auth';
import { useCurrentTenant, useMyTenants } from '@/hooks/use-tenants';
import { useHealthStatus } from '@/hooks/use-monitoring';
import { useOverviewSummary } from '@/hooks/use-overview-summary';
import { useNeedsYou } from '@/hooks/use-needs-you';
import { RANGES, firstName, greeting, systemOk, todayLabel, verdictFor, verdictFromCore, type Range } from '@/lib/overview';
import { findHealthEntry, DATABASE_WORDS, STORAGE_WORDS } from '@/components/overview/system-strip';
import { cn } from '@/lib/utils';

export function RangeSwitch({ value, onChange }: { value: Range; onChange: (range: Range) => void }) {
  return (
    <div role="group" aria-label="Range" className="bg-secondary flex gap-1 rounded-[11px] p-1">
      {RANGES.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={value === range}
          onClick={() => onChange(range)}
          className={cn(
            'h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors duration-150 outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95',
            value === range
              ? 'bg-card text-foreground shadow-[var(--shadow-thumb)]'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {range} days
        </button>
      ))}
    </div>
  );
}

/** The tenant and the date, the greeting, a sentence on how things stand, and the range switch. */
export function OverviewHeader({ range, onRange }: { range: Range; onRange: (range: Range) => void }) {
  const { user } = useAuth();
  const slug = useCurrentTenant();
  const tenants = useMyTenants();
  const needs = useNeedsYou();
  const health = useHealthStatus();
  const overview = useOverviewSummary();
  const tenant = tenants.data?.find((t) => t.slug === slug)?.name ?? slug;
  const name = firstName(user?.username);
  const now = new Date();
  const hello = greeting(now.getHours());

  // The server's verdict when GET /api/overview answers. Against a core without the route the line
  // is built from what the page loaded, once Needs you has answered, so it never claims "nothing
  // is waiting" while it loads.
  const verdict = overview.summary
    ? verdictFromCore(overview.summary)
    : overview.isLoading || !(overview.unavailable || overview.isError) || needs.isLoading || needs.isError
      ? null
      : verdictFor({
        needs: needs.rows.length,
        decision: needs.rows.some((row) => row.decision),
        systemOk: systemOk([
          findHealthEntry(health.data?.entries, DATABASE_WORDS)?.status,
          findHealthEntry(health.data?.entries, STORAGE_WORDS)?.status,
        ]),
      });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="grid min-w-[min(100%,320px)] flex-1 gap-1.5">
        <span className="text-muted-foreground text-[13.5px]">
          {tenant ? `${tenant} · ` : ''}
          {todayLabel(now)}
        </span>
        <h1 className="font-display text-[32px] font-semibold tracking-[-0.035em]">
          {name ? `${hello}, ${name}` : hello}
        </h1>
        {verdict && (
          <p role="status" className="text-secondary-foreground flex items-center gap-[9px] text-[15px]">
            <span
              aria-hidden
              data-testid="verdict-dot"
              className={cn(
                'size-[9px] shrink-0 rounded-full',
                verdict.tone === 'ok' && 'bg-success',
                verdict.tone === 'warn' && 'bg-warning',
                verdict.tone === 'bad' && 'bg-destructive',
              )}
            />
            {verdict.text}
          </p>
        )}
      </div>
      <RangeSwitch value={range} onChange={onRange} />
    </div>
  );
}
