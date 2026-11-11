'use client';

import { cn } from '@/lib/utils';

export interface StatusChip {
  label: string;
  /** The status sent to the server, or undefined for All. */
  value: string | undefined;
}

/**
 * The status chips, as toggle buttons with their counts in the accessible name.
 *
 * `counts` is whatever the caller could honestly tally. A chip with no entry in it shows no number
 * rather than a zero: the list reply carries no per-status counts, so a number here is a tally of
 * the page that was loaded, and the group says so beside the chips and in each name.
 *
 * The name is the visible text, label then count with a space between, so it always contains what is
 * on screen (axe label-content-name-mismatch fails an aria-label that rewrites it). The group is
 * described by the "Counts on this page" note.
 */
export function EntryStatusChips({
  chips,
  value,
  counts,
  onChange,
}: {
  chips: StatusChip[];
  value: string | undefined;
  counts: Record<string, number>;
  onChange: (value: string | undefined) => void;
}) {
  const hasCounts = Object.keys(counts).length > 0;

  return (
    <div
      role="group"
      aria-label="Filter by status"
      aria-describedby={hasCounts ? 'entry-status-note' : undefined}
      className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => {
        const key = chip.value ?? 'all';
        const count = counts[key];
        const pressed = chip.value === value;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={pressed}
            // Pressing the one that is on goes back to All, so a chip is a toggle and not a radio.
            onClick={() => onChange(pressed ? undefined : chip.value)}
            className={cn(
              'focus-visible:ring-ring/50 inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[12px] font-bold whitespace-nowrap outline-none focus-visible:ring-[3px]',
              pressed
                ? 'bg-foreground text-background border-transparent'
                : 'bg-card text-foreground hover:bg-secondary'
            )}
          >
            {chip.label}
            {count !== undefined && (
              <>
                {' '}
                <span className="font-mono text-[11px] tabular-nums opacity-70">{count}</span>
              </>
            )}
          </button>
        );
      })}
      {hasCounts && <span id="entry-status-note" className="text-muted-foreground text-[11px]">
          Counts on this page
        </span>}
    </div>
  );
}
