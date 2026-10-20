'use client';

import { useAuth } from '@/hooks/use-auth';
import { useCurrentTenant, useMyTenants } from '@/hooks/use-tenants';
import { RANGES, firstName, greeting, type Range } from '@/lib/overview';
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

/** The tenant name, the greeting by the hour and the name on the token, and the range switch. */
export function OverviewHeader({ range, onRange }: { range: Range; onRange: (range: Range) => void }) {
  const { user } = useAuth();
  const slug = useCurrentTenant();
  const tenants = useMyTenants();
  const tenant = tenants.data?.find((t) => t.slug === slug)?.name ?? slug;
  const name = firstName(user?.username);
  const hello = greeting(new Date().getHours());

  return (
    <div className="flex flex-wrap items-end gap-3.5">
      <div className="grid flex-1 gap-1">
        {tenant && <span className="text-muted-foreground text-[13.5px]">{tenant}</span>}
        <h1 className="font-display text-[34px] font-semibold tracking-[-0.035em]">
          {name ? `${hello}, ${name}` : hello}
        </h1>
      </div>
      <RangeSwitch value={range} onChange={onRange} />
    </div>
  );
}
