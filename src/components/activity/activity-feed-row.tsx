import Link from 'next/link';
import { IconArchive } from '@/components/icons';
import { StatusBadge } from '@/components/patterns/status-badge';
import { kindInfo, relativeTime, safeRef } from '@/lib/activity';
import type { ActivityRow } from '@/types/activity';

const TILE_TONES = {
  success: 'bg-[var(--success-soft)] text-success',
  warning: 'bg-[var(--warning-soft)] text-warning',
  muted: 'bg-secondary text-secondary-foreground',
  subtle: 'bg-secondary text-muted-foreground',
  destructive: 'bg-[var(--danger-soft)] text-destructive',
  accent: 'bg-accent text-accent-foreground',
} as const;

/**
 * One 48px line of the feed: tile, age, sentence, kind chip.
 *
 * A kind this console does not know keeps the API's own sentence and shows its name in mono, so a
 * new kind on the server reads as something rather than as a blank row.
 */
export function ActivityFeedRow({ row, now }: { row: ActivityRow; now?: number }) {
  const info = kindInfo(row.kind);
  const Icon = info?.icon ?? IconArchive;
  const href = safeRef(row.ref);
  const subject = row.subject.title || row.subject.id;

  const subjectNode = !subject ? null : href ? (
    <Link href={href} className="font-medium underline-offset-2 hover:underline">
      {subject}
    </Link>
  ) : (
    <span className="font-medium">{subject}</span>
  );

  return (
    <li className="flex h-12 items-center gap-3 border-b px-3 text-sm last:border-b-0" data-kind={row.kind}>
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-md ${TILE_TONES[info?.tone ?? 'muted']}`}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <time dateTime={row.at} className="text-muted-foreground w-20 shrink-0 text-xs">
        {relativeTime(row.at, now)}
      </time>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{row.actor.name}</span>{' '}
        {info ? (
          <>
            {info.sentence} {subjectNode}
          </>
        ) : (
          <>
            {row.text} {subjectNode}
          </>
        )}
      </span>
      {info ? (
        <StatusBadge tone={info.tone} dot={false} className="shrink-0">
          {row.kind}
        </StatusBadge>
      ) : (
        <code className="shrink-0 font-mono text-xs">{row.kind}</code>
      )}
    </li>
  );
}
