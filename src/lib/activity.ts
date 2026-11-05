import { z } from 'zod';

/**
 * One row of GET /api/activity (barakoCMS 5.5): what happened in the tenant, in one vocabulary.
 *
 * Lenient on purpose. The API owns the kinds and may add one; a console that rejects a page for a
 * name it has not met would blank the feed on the first release that adds a kind. An unknown kind
 * is drawn as its name, and a field that is missing is drawn as nothing.
 */
const activityItemSchema = z.looseObject({
  id: z.string(),
  at: z.string(),
  kind: z.string(),
  severity: z.string().nullish(),
  actor: z.looseObject({ kind: z.string().nullish(), name: z.string().nullish() }).nullish(),
  subject: z.looseObject({ kind: z.string().nullish(), id: z.string().nullish(), title: z.string().nullish() }).nullish(),
  text: z.string().nullish(),
  ref: z.string().nullish(),
});

export const activityPageSchema = z.looseObject({
  items: z.array(activityItemSchema),
  cursor: z.string().nullish(),
  hasMore: z.boolean().nullish(),
});

export type ActivityItem = z.infer<typeof activityItemSchema>;
export type ActivityPage = z.infer<typeof activityPageSchema>;

/** The nine kinds the API documents, with the words the console uses for each. */
const KIND_LABELS: Record<string, string> = {
  published: 'Published',
  scheduled: 'Scheduled',
  edited: 'Edited',
  'run.succeeded': 'Run succeeded',
  'run.failed': 'Run failed',
  bounced: 'Bounced',
  signin: 'Sign-in',
  imported: 'Imported',
  'type.changed': 'Type changed',
};

/** The label for a kind, or null for one this console does not know (shown as its name, in mono). */
export function kindLabel(kind: string): string | null {
  return KIND_LABELS[kind] ?? null;
}

/**
 * A console path the API gave, or null. `ref` is a path inside this console, so only a single-slash
 * path is followed: anything with a scheme, or a protocol-relative `//host`, would send the browser
 * off the console.
 */
export function safeRef(ref: string | null | undefined): string | null {
  if (!ref || !ref.startsWith('/') || ref.startsWith('//') || ref.includes('\\')) return null;
  return ref;
}

/** "now", "2 min", "1 h", "3 d". Empty when the time does not parse. */
export function relativeTime(at: string, now: number): string {
  const then = Date.parse(at);
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

/** Whether a row wants a person: the API marks it `warning` or `error`. */
export function needsAttention(item: Pick<ActivityItem, 'severity'>): boolean {
  return item.severity === 'warning' || item.severity === 'error';
}

/**
 * The rows for Needs you: the newest row of each id that still carries a warning or an error. The
 * API keeps a run's id as it moves from failed to succeeded, so a run that was retried and passed
 * arrives as a success and drops out here. Newest first, as the feed sent them.
 */
export function attentionRows(items: readonly ActivityItem[]): ActivityItem[] {
  const seen = new Set<string>();
  const out: ActivityItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (needsAttention(item)) out.push(item);
  }
  return out;
}
