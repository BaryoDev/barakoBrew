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
