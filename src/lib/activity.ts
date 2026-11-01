import type { ComponentType, SVGProps } from 'react';
import {
  IconBolt,
  IconCalendar,
  IconCheckCircle,
  IconContentTypes,
  IconEnvelope,
  IconPen,
  IconSignIn,
  IconTable,
  IconTimesCircle,
} from '@/components/icons';
import type { Tone } from '@/components/patterns/status-badge';
import type { ActivityRow } from '@/types/activity';

export interface ActivityKindInfo {
  tone: Tone;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** The verb phrase that follows the actor. */
  sentence: string;
}

/** The nine kinds the API names. Anything else renders as its own name. */
export const ACTIVITY_KINDS: Record<string, ActivityKindInfo> = {
  published: { tone: 'success', icon: IconCheckCircle, sentence: 'published' },
  scheduled: { tone: 'accent', icon: IconCalendar, sentence: 'scheduled' },
  edited: { tone: 'muted', icon: IconPen, sentence: 'edited' },
  'run.succeeded': { tone: 'success', icon: IconBolt, sentence: 'ran successfully on' },
  'run.failed': { tone: 'destructive', icon: IconTimesCircle, sentence: 'failed to run on' },
  bounced: { tone: 'warning', icon: IconEnvelope, sentence: 'had an email bounce for' },
  signin: { tone: 'subtle', icon: IconSignIn, sentence: 'signed in' },
  imported: { tone: 'accent', icon: IconTable, sentence: 'imported' },
  'type.changed': { tone: 'warning', icon: IconContentTypes, sentence: 'changed the content type' },
};

export function kindInfo(kind: string): ActivityKindInfo | undefined {
  return Object.hasOwn(ACTIVITY_KINDS, kind) ? ACTIVITY_KINDS[kind] : undefined;
}

export interface ActivityFilter {
  id: string;
  label: string;
  /** The kinds this chip asks the API for. Empty means every kind. */
  kinds: readonly string[];
  /** A chip that also matches any row the API marks as a problem. */
  problems?: boolean;
}

export const ACTIVITY_FILTERS: readonly ActivityFilter[] = [
  { id: 'all', label: 'Everything', kinds: [] },
  { id: 'problems', label: 'Problems', kinds: ['run.failed', 'bounced'], problems: true },
  { id: 'publishing', label: 'Publishing', kinds: ['published', 'scheduled'] },
  { id: 'runs', label: 'Workflow runs', kinds: ['run.succeeded', 'run.failed'] },
  { id: 'signins', label: 'Sign-ins', kinds: ['signin'] },
  { id: 'imports', label: 'Imports', kinds: ['imported'] },
];

export function isProblem(row: ActivityRow): boolean {
  return row.severity === 'error' || row.severity === 'warning';
}

export function matchesFilter(row: ActivityRow, filter: ActivityFilter): boolean {
  if (filter.problems) return isProblem(row) || filter.kinds.includes(row.kind);
  return filter.kinds.length === 0 || filter.kinds.includes(row.kind);
}

/** How many of the loaded rows each chip matches, by filter id. */
export function countByFilter(rows: readonly ActivityRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const filter of ACTIVITY_FILTERS) {
    counts[filter.id] = rows.filter((row) => matchesFilter(row, filter)).length;
  }
  return counts;
}

/** A short age such as `just now`, `5m ago`, `3h ago`, `2d ago`. Empty for an unreadable time. */
export function relativeTime(value: string, now: number = Date.now()): string {
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return '';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Only a path inside the console is linked. Anything else is shown but not clickable. */
export function safeRef(ref: string): string | null {
  return ref.startsWith('/') && !ref.startsWith('//') ? ref : null;
}
