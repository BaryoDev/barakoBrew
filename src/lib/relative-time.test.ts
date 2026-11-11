import { describe, expect, it } from 'vitest';
import { exactTime, relativeTime } from './relative-time';

const NOW = new Date('2026-11-10T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it('writes minutes, hours and days the way the design does', () => {
    expect(relativeTime(ago(2 * MIN), NOW)).toBe('2 min ago');
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe('3h ago');
    expect(relativeTime(ago(30 * HOUR), NOW)).toBe('Yesterday');
    expect(relativeTime(ago(3 * DAY), NOW)).toBe('3 days ago');
  });

  it('counts weeks, then falls back to a month and year', () => {
    expect(relativeTime(ago(8 * DAY), NOW)).toBe('1 week ago');
    expect(relativeTime(ago(15 * DAY), NOW)).toBe('2 weeks ago');
    expect(relativeTime('2026-03-05T00:00:00Z', NOW)).toBe('Mar 2026');
  });

  it('does not print a negative age for a time slightly in the future', () => {
    expect(relativeTime(new Date(NOW.getTime() + 5000).toISOString(), NOW)).toBe('just now');
  });

  it('returns what it was given when it is not a date', () => {
    expect(relativeTime('not a date', NOW)).toBe('not a date');
    expect(exactTime('not a date')).toBe('not a date');
  });

  it('gives the exact time as the local rendering of the same instant', () => {
    expect(exactTime('2026-11-10T09:00:00Z')).toBe(
      new Date('2026-11-10T09:00:00Z').toLocaleString()
    );
  });
});
