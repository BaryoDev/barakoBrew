import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import {
  IconBolt,
  IconCheckCircle,
  IconContentTypes,
  IconEnvelope,
  IconHistory,
  IconPen,
  IconShield,
  IconTable,
  IconWorkflows,
} from '@/components/icons';
import {
  activitySentence,
  kindTone,
  relativeTime,
  safeRef,
  type ActivityItem,
  type ActivityTone,
} from '@/lib/activity';
import { cn } from '@/lib/utils';

const GLYPHS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  published: IconCheckCircle,
  scheduled: IconHistory,
  edited: IconPen,
  'run.succeeded': IconWorkflows,
  'run.failed': IconWorkflows,
  bounced: IconEnvelope,
  signin: IconShield,
  imported: IconTable,
  'type.changed': IconContentTypes,
};

const TILE: Record<ActivityTone, string> = {
  ok: 'bg-[var(--success-soft)] text-success',
  accent: 'bg-accent text-accent-foreground',
  muted: 'bg-secondary text-muted-foreground',
  bad: 'bg-[var(--danger-soft)] text-destructive',
  warn: 'bg-[var(--warning-soft)] text-warning',
};

/**
 * One row of the activity feed, shared by the Activity screen and the Overview card. 48px at least:
 * a tile for the kind, the time, a sentence built from kind, actor and subject title, and the kind.
 * A kind this console does not know gets a neutral glyph and its name in mono.
 *
 * The title is set as text, never markup. The row opens `ref` only when it stays on this console.
 */
export function ActivityRow({ item, now }: { item: ActivityItem; now: number }) {
  const href = safeRef(item.ref);
  const Glyph = GLYPHS[item.kind] ?? IconBolt;
  const { actor, verb, subject } = activitySentence(item);
  const body = (
    <>
      <b className="text-foreground font-semibold">{actor}</b> {verb}
      {subject ? (
        <>
          {' '}
          <b className="text-foreground font-semibold">{subject}</b>
        </>
      ) : null}
    </>
  );
  return (
    <li className="border-border rise grid min-h-12 grid-cols-[auto_56px_minmax(0,1fr)_auto] items-center gap-3 border-t py-2 first:border-t-0">
      <span className={cn('grid size-7 place-items-center rounded-lg', TILE[kindTone(item.kind)])} aria-hidden>
        <Glyph className="size-[15px]" />
      </span>
      <span className="text-muted-foreground font-mono text-[11.5px]">{relativeTime(item.at, now)}</span>
      <span className="text-secondary-foreground min-w-0 text-sm leading-[1.45]">
        {href ? (
          <Link href={href} className="hover:text-foreground rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50">
            {body}
          </Link>
        ) : (
          body
        )}
      </span>
      <span
        className={cn(
          'bg-secondary text-muted-foreground flex-none rounded-full px-2 py-0.5 font-mono text-[11px]',
          item.severity === 'error' && 'text-destructive',
          item.severity === 'warning' && 'text-warning',
        )}
      >
        {item.kind}
      </span>
    </li>
  );
}
