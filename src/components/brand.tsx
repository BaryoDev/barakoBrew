'use client';

import { useId } from 'react';

import { cn } from '@/lib/utils';

/**
 * The mark, wherever the product signs its name: the sidebar and the admin shell.
 *
 * It was a mug glyph reversed out of a filled purple tile. The bean is the Signal mark and the
 * sign-in page has been drawing it since that design landed, so the two front doors of the same
 * product did not look like the same product. This is the same component the sign-in page uses,
 * at the same footprint the tile had, so no call site changes.
 */
export function BrandMark({ className }: { className?: string }) {
  return <BrandBean className={cn('size-8 shrink-0', className)} />;
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display text-[19px] font-semibold tracking-[-0.03em]', className)}>
      barako<span className="text-primary">Brew</span>
    </span>
  );
}

/**
 * The coffee bean, the Signal mark.
 *
 * The gradient id is scoped with useId because the sign-in page draws the bean twice, once as the
 * 44px mark and once as the oversized watermark, and two <defs> sharing a literal id means the
 * second one silently wins for both.
 */
export function BrandBean({
  className,
  decorative = false,
  flat = false,
  highlight,
  title = 'BarakoCMS',
}: {
  className?: string;
  /** Drop the highlight and the accessible name. For the watermark, which carries no meaning. */
  decorative?: boolean;
  /**
   * The canvas bean on the dark sign-in panel: a flat #8E7DF5 body and a #14162A seam, no gradient.
   * The gradient goes dark at one corner, which reads as a smudge on the panel.
   */
  flat?: boolean;
  /** Draw the highlight. Defaults to on unless `decorative`. The large bean on the panel turns it on. */
  highlight?: boolean;
  title?: string;
}) {
  const gradientId = `bean-${useId()}`;

  return (
    <svg
      viewBox="0 0 128 128"
      className={className}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9c8df5" />
          <stop offset="0.55" stopColor="var(--primary)" />
          <stop offset="1" stopColor="#33257f" />
        </linearGradient>
      </defs>
      <g transform="rotate(-32 64 64)">
        <ellipse cx="64" cy="64" rx="33" ry="50" fill={flat ? '#8e7df5' : `url(#${gradientId})`} />
        {(highlight ?? !decorative) && (
          <ellipse cx="52" cy="44" rx="9" ry="17" fill={flat ? '#e6e1ff' : '#c9c1f5'} opacity="0.35" />
        )}
        <path
          d="M64 17 C 51 41, 77 55, 64 64 C 51 73, 77 87, 64 111"
          fill="none"
          stroke={flat ? '#14162a' : 'var(--accent-deep)'}
          strokeWidth={flat ? 7 : 6.5}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
