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

/** "Monday, 6 November", the way the design writes the date under the tenant name. */
export function todayLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
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

/** Below this many rows in the earlier window a percentage swings too hard to mean anything. */
const SMALL_WINDOW = 10;

/**
 * The last `range` days against the `range` days before them, worded as a sentence, or null when
 * the sample cannot say.
 *
 * A small earlier window is told as a count ("3 fewer"), since 1 to 3 reading as "+200%" is noise.
 * A larger one is a percentage, with what it is against ("+12% vs prior"). Nothing in the earlier
 * window gives the count that arrived.
 */
export function changeOver(sample: Sample, range: Range, now: number): Change | null {
  if (!coversTwoRanges(sample, range, now)) return null;
  const all = times(sample.rows);
  const current = all.filter((t) => t > now - range * DAY_MS && t <= now).length;
  const previous = all.filter((t) => t > now - 2 * range * DAY_MS && t <= now - range * DAY_MS).length;
  if (current === previous) return { text: 'No change', direction: 'flat' };
  if (previous === 0) return { text: `${current} new`, direction: 'up' };
  if (previous <= SMALL_WINDOW) {
    const gap = Math.abs(current - previous);
    return current > previous
      ? { text: `${gap} more`, direction: 'up' }
      : { text: `${gap} fewer`, direction: 'down' };
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { text: 'No change', direction: 'flat' };
  return percent > 0
    ? { text: `+${percent}% vs prior`, direction: 'up' }
    : { text: `−${Math.abs(percent)}% vs prior`, direction: 'down' };
}

export type Tone = 'ok' | 'warn' | 'bad';

/**
 * Whether the checks the strip reads (database, storage) are all healthy: true when every one that
 * was reported is, false when any is not, null when none was reported so nothing can be claimed.
 */
export function systemOk(statuses: readonly (string | undefined)[]): boolean | null {
  const known = statuses.filter((status): status is string => !!status);
  if (known.length === 0) return null;
  return known.every((status) => status === 'Healthy');
}

export interface Verdict {
  text: string;
  tone: Tone;
}

/**
 * The sentence under the greeting, built from what the page has already loaded. `needs` is the
 * number of rows in Needs you, `decision` whether one of them is a call only a person can make (a
 * failed run: retrying may send twice), and `systemOk` the result of {@link systemOk}.
 * "Your site is up" is said only when a check said so.
 */
export function verdictFor({ needs, decision, systemOk: ok }: { needs: number; decision: boolean; systemOk: boolean | null }): Verdict {
  const up = ok === true ? 'Your site is up. ' : '';
  if (ok === false) {
    return {
      text:
        needs === 0
          ? 'Part of the system is not healthy.'
          : `Part of the system is not healthy, and ${needs} ${needs === 1 ? 'thing needs' : 'things need'} you.`,
      tone: 'bad',
    };
  }
  if (needs === 0) {
    return { text: ok === true ? 'Your site is up and nothing is waiting on you.' : 'Nothing is waiting on you.', tone: 'ok' };
  }
  return {
    text: `${up}${needs} ${needs === 1 ? 'thing needs' : 'things need'} you${decision ? ', one of them a decision only you can make.' : '.'}`,
    tone: decision ? 'bad' : 'warn',
  };
}

/** "running a workflow" when any of these runs is Running or Pending, else "idle". */
export function runnerState(rows: readonly { status?: unknown }[]): 'running a workflow' | 'idle' {
  return rows.some((row) => row.status === 'Running' || row.status === 'Pending') ? 'running a workflow' : 'idle';
}

/** The pill at the head of the system strip: how many items are off, or that none are. */
export function systemVerdict(tones: readonly (Tone | 'none')[]): { text: string; tone: Tone } {
  const off = tones.filter((tone) => tone === 'warn' || tone === 'bad').length;
  if (off === 0) return { text: 'All systems normal', tone: 'ok' };
  return { text: `${off} ${off === 1 ? 'warning' : 'warnings'}`, tone: tones.includes('bad') ? 'bad' : 'warn' };
}

/** "00:00:00.0040000" (a .NET TimeSpan) as milliseconds, or null when it does not read as one. */
export function durationMs(value: string | undefined): number | null {
  const match = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(value ?? '');
  if (!match) return null;
  const [, days = '0', h, m, s, fraction = '0'] = match;
  const seconds = ((Number(days) * 24 + Number(h)) * 60 + Number(m)) * 60 + Number(s);
  return Math.round(seconds * 1000 + Number(`0.${fraction}`) * 1000);
}
