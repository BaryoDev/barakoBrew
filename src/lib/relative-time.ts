const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A time the way the Entries design writes it: "2 min ago", "3h ago", "Yesterday", "3 days ago",
 * "1 week ago", then "Mar 2026" once it is a month or more old.
 *
 * `now` is a parameter so a test does not depend on the clock. An unparseable value comes back as
 * the raw string rather than "NaN days ago", which would read as data.
 */
export function relativeTime(value: string, now: Date = new Date()): string {
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return value;

  const elapsed = now.getTime() - then.getTime();
  // A clock a little ahead of the server's is skew, and reads as now. A time further ahead than
  // that is not an age at all, so it gets the exact time rather than a made-up "just now".
  if (elapsed < -MINUTE) return exactTime(value);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 2 * DAY) return 'Yesterday';
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} days ago`;
  if (elapsed < 30 * DAY) {
    const weeks = Math.floor(elapsed / (7 * DAY));
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  return `${MONTHS[then.getMonth()]} ${then.getFullYear()}`;
}

/** The exact time, for a title or tooltip beside the relative one. */
export function exactTime(value: string): string {
  const then = new Date(value);
  return Number.isNaN(then.getTime()) ? value : then.toLocaleString();
}

const pad = (n: number) => String(n).padStart(2, '0');

function clock(at: Date): string {
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** Midnight at the start of a date's local day, so two times compare by calendar day and not by 24h. */
function dayStart(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

/**
 * A moment the way the runs design writes it: "Today 08:51", "Yesterday 17:05", "Nov 9 14:20" for an
 * older day this year and "Nov 9, 2025 14:20" for another year. Days are the reader's calendar days,
 * so 23:50 last night is Yesterday at 00:10, not "20 minutes ago". Put `exactTime(value)` in a title beside it.
 *
 * An unparseable value comes back as the raw string, as `relativeTime` does. A time on a later day
 * reads as its date, not "Tomorrow", since a run has no business being ahead of the clock.
 */
export function momentLabel(value: string, now: Date = new Date()): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;

  const days = Math.round((dayStart(now) - dayStart(at)) / DAY);
  if (days === 0) return `Today ${clock(at)}`;
  if (days === 1) return `Yesterday ${clock(at)}`;

  const date = `${MONTHS[at.getMonth()]} ${at.getDate()}`;
  return at.getFullYear() === now.getFullYear() ? `${date} ${clock(at)}` : `${date}, ${at.getFullYear()} ${clock(at)}`;
}
