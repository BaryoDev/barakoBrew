/** Pure helpers behind the Overview stat cards. No requests are made here. */

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

export const SPARK_BARS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

export function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** `ana_reyes` reads as Ana, `rosa` as Rosa. Empty when there is nothing to call someone. */
export function firstName(username: string | undefined): string {
  const first = (username ?? '').split(/[^A-Za-z0-9]+/).find(Boolean) ?? '';
  return first ? first[0].toUpperCase() + first.slice(1) : '';
}

/** Timestamps of the rows of a list. Rows with an unreadable date are dropped. */
function times(rows: readonly { createdAt: string }[]): number[] {
  return rows.map((r) => Date.parse(r.createdAt)).filter(Number.isFinite);
}

/**
 * Rows per slice of the last `range` days, oldest slice first.
 *
 * The rows are a bounded sample (the newest page of a list), so this says how many of those rows
 * fall in each slice, not how many exist.
 */
export function sparkBars(
  rows: readonly { createdAt: string }[],
  range: Range,
  now: number,
  bars = SPARK_BARS,
): number[] {
  const start = now - range * DAY_MS;
  const width = (range * DAY_MS) / bars;
  const out = Array<number>(bars).fill(0);
  for (const t of times(rows)) {
    if (t < start || t > now) continue;
    out[Math.min(bars - 1, Math.floor((t - start) / width))] += 1;
  }
  return out;
}

export interface Sample {
  rows: readonly { createdAt: string }[];
  totalItems: number;
  hasNextPage: boolean;
}

/**
 * Whether the sample reaches back two ranges, which a before-and-after comparison needs. A full
 * sample that stops short of that would count the rows it never read as zero.
 */
export function coversTwoRanges(sample: Sample, range: Range, now: number): boolean {
  if (!sample.hasNextPage) return true;
  const oldest = Math.min(...times(sample.rows));
  return Number.isFinite(oldest) && oldest <= now - 2 * range * DAY_MS;
}

export interface Change {
  text: string;
  direction: 'up' | 'down' | 'flat';
}

/**
 * The last `range` days against the `range` days before them, or null when the sample cannot say.
 * Nothing in the previous window gives no percentage, only the count that arrived.
 */
export function changeOver(sample: Sample, range: Range, now: number): Change | null {
  if (!coversTwoRanges(sample, range, now)) return null;
  const all = times(sample.rows);
  const current = all.filter((t) => t > now - range * DAY_MS && t <= now).length;
  const previous = all.filter((t) => t > now - 2 * range * DAY_MS && t <= now - range * DAY_MS).length;
  if (previous === 0) {
    return current === 0 ? { text: '0%', direction: 'flat' } : { text: `+${current} new`, direction: 'up' };
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { text: '0%', direction: 'flat' };
  return percent > 0
    ? { text: `+${percent}%`, direction: 'up' }
    : { text: `−${Math.abs(percent)}%`, direction: 'down' };
}

/** "00:00:00.0040000" (a .NET TimeSpan) as milliseconds, or null when it does not read as one. */
export function durationMs(value: string | undefined): number | null {
  const match = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(value ?? '');
  if (!match) return null;
  const [, days = '0', h, m, s, fraction = '0'] = match;
  const seconds = ((Number(days) * 24 + Number(h)) * 60 + Number(m)) * 60 + Number(s);
  return Math.round(seconds * 1000 + Number(`0.${fraction}`) * 1000);
}
