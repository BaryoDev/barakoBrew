import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exactTime, momentLabel, relativeTime } from './relative-time';

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

  it('gives the exact time for a date a day ahead, and "just now" only for small skew', () => {
    const tomorrow = new Date(NOW.getTime() + DAY).toISOString();
    expect(relativeTime(tomorrow, NOW)).toBe(exactTime(tomorrow));
    expect(relativeTime(tomorrow, NOW)).not.toBe('just now');
    expect(relativeTime(new Date(NOW.getTime() + 30_000).toISOString(), NOW)).toBe('just now');
  });

  describe('the month form, in a zone that is not UTC', () => {
    const zone = process.env.TZ;
    beforeEach(() => {
      process.env.TZ = 'Pacific/Auckland';
    });
    afterEach(() => {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    });

    it('names the month the title shows, not the UTC one', () => {
      // 12:00 UTC on 28 Feb is 01:00 on 1 March in Auckland (UTC+13 in summer).
      const value = '2026-02-28T12:00:00Z';
      expect(new Date(value).getMonth()).toBe(2);
      expect(relativeTime(value, NOW)).toBe('Mar 2026');
    });
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

describe('momentLabel', () => {
  // Built from local parts, so the cases hold in any zone the suite runs in.
  const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString();
  const now = new Date(2026, 10, 14, 9, 30);

  it('says Today with the clock for a time on the same day', () => {
    expect(momentLabel(at(2026, 11, 14, 8, 51), now)).toBe('Today 08:51');
  });

  it('says Yesterday for the day before, even a few minutes across midnight', () => {
    expect(momentLabel(at(2026, 11, 13, 17, 5), now)).toBe('Yesterday 17:05');
    expect(momentLabel(at(2026, 11, 13, 23, 55), new Date(2026, 10, 14, 0, 5))).toBe('Yesterday 23:55');
  });

  it('writes the date for an older day this year', () => {
    expect(momentLabel(at(2026, 11, 9, 14, 20), now)).toBe('Nov 9 14:20');
    expect(momentLabel(at(2026, 1, 2, 7, 5), now)).toBe('Jan 2 07:05');
  });

  it('adds the year for another year', () => {
    expect(momentLabel(at(2025, 12, 31, 22, 0), now)).toBe('Dec 31, 2025 22:00');
  });

  it('returns what it was given when it is not a date', () => {
    expect(momentLabel('not a date', now)).toBe('not a date');
  });
});
