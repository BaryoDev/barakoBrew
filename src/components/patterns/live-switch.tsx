'use client';

import { cn } from '@/lib/utils';

/**
 * The Live / Paused switch. A person turns a feed off to read it without rows moving, and on again
 * to follow it. The dot is green and pulses only while the feed is live and actually updating.
 *
 * `stalled` is for a feed that is switched on but not updating (a refused or failing poll). It keeps
 * the label honest: the dot stops pulsing, and the page says why elsewhere.
 */
export function LiveSwitch({
  live,
  onChange,
  stalled = false,
  label = 'Live updates',
  className,
}: {
  live: boolean;
  onChange: (next: boolean) => void;
  stalled?: boolean;
  /** The accessible name, which says what the switch controls. */
  label?: string;
  className?: string;
}) {
  const moving = live && !stalled;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={live}
      aria-label={label}
      onClick={() => onChange(!live)}
      className={cn(
        'border-border bg-card text-foreground inline-flex h-[38px] items-center gap-2 rounded-[10px] border px-3.5 text-[13px] font-semibold outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('size-2 rounded-full', moving ? 'pulse bg-success' : live ? 'bg-warning' : 'bg-(--faint)')}
      />
      {live ? 'Live' : 'Paused'}
    </button>
  );
}
