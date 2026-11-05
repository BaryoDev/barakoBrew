import { describe, it, expect } from 'vitest';
import { changeOver, durationMs, firstName, greeting, runnerState, sparkBars, systemOk, systemVerdict, todayLabel, verdictFor } from './overview';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const daysAgo = (d: number) => ({ createdAt: new Date(NOW - d * 86_400_000).toISOString() });

describe('greeting', () => {
    it('follows the hour', () => {
        expect([greeting(8), greeting(14), greeting(21)]).toEqual(['Good morning', 'Good afternoon', 'Good evening']);
    });
});

describe('firstName', () => {
    it('takes the first word and capitalises it', () => {
        expect(firstName('ana_reyes')).toBe('Ana');
        expect(firstName('rosa')).toBe('Rosa');
        expect(firstName(undefined)).toBe('');
    });
});

describe('sparkBars', () => {
    it('puts each row in its slice, oldest first', () => {
        const bars = sparkBars([daysAgo(0.1), daysAgo(0.2), daysAgo(29.9)], 30, NOW);
        expect(bars).toHaveLength(12);
        expect(bars[11]).toBe(2);
        expect(bars[0]).toBe(1);
        expect(bars.reduce((a, b) => a + b, 0)).toBe(3);
    });

    it('drops rows outside the range', () => {
        const bars = sparkBars([daysAgo(40)], 30, NOW);
        expect(bars.every((n) => n === 0)).toBe(true);
    });
});

describe('changeOver', () => {
    const sample = (rows: { createdAt: string }[], hasNextPage = false) => ({ rows, totalItems: rows.length, hasNextPage });

    const many = (inside: number, before: number) => [
        ...Array.from({ length: inside }, () => daysAgo(1)),
        ...Array.from({ length: before }, () => daysAgo(8)),
    ];

    it('is the percent change against the range before, once that range is big enough to mean it', () => {
        expect(changeOver(sample(many(30, 20)), 7, NOW)).toEqual({ text: '+50% vs prior', direction: 'up' });
        expect(changeOver(sample(many(10, 30)), 7, NOW)).toEqual({ text: '−67% vs prior', direction: 'down' });
    });

    it('tells a small range as a count of more or fewer', () => {
        expect(changeOver(sample(many(3, 6)), 7, NOW)).toEqual({ text: '3 fewer', direction: 'down' });
        expect(changeOver(sample(many(5, 4)), 7, NOW)).toEqual({ text: '1 more', direction: 'up' });
    });

    it('says how many arrived when there was nothing before', () => {
        expect(changeOver(sample([daysAgo(1), daysAgo(2)]), 7, NOW)).toEqual({ text: '2 new', direction: 'up' });
    });

    it('says No change when the two ranges match', () => {
        expect(changeOver(sample(many(4, 4)), 7, NOW)).toEqual({ text: 'No change', direction: 'flat' });
        expect(changeOver(sample([]), 7, NOW)).toEqual({ text: 'No change', direction: 'flat' });
    });

    it('is null when a full page stops short of the range before', () => {
        expect(changeOver(sample([daysAgo(1), daysAgo(3)], true), 7, NOW)).toBeNull();
    });

    it('reads a full page that reaches back far enough', () => {
        expect(changeOver(sample([daysAgo(1), daysAgo(20)], true), 7, NOW)).not.toBeNull();
    });
});

describe('durationMs', () => {
    it('reads a .NET TimeSpan', () => {
        expect(durationMs('00:00:00.0040000')).toBe(4);
        expect(durationMs('00:00:01.5000000')).toBe(1500);
    });

    it('is null for anything else', () => {
        expect(durationMs(undefined)).toBeNull();
        expect(durationMs('fast')).toBeNull();
    });
});

describe('todayLabel', () => {
    it('writes the weekday, day and month', () => {
        expect(todayLabel(new Date(2026, 10, 6))).toBe('Friday 6 November');
    });
});

describe('verdictFor', () => {
    it('says the site is up and nothing waits, when a check said so', () => {
        expect(verdictFor({ needs: 0, decision: false, systemOk: true })).toEqual({
            text: 'Your site is up and nothing is waiting on you.',
            tone: 'ok',
        });
    });

    it('does not claim the site is up without a health check', () => {
        expect(verdictFor({ needs: 0, decision: false, systemOk: null }).text).toBe('Nothing is waiting on you.');
        expect(verdictFor({ needs: 2, decision: false, systemOk: null }).text).toBe('2 things need you.');
    });

    it('counts what needs you, and names a decision only a person can make', () => {
        expect(verdictFor({ needs: 1, decision: false, systemOk: true })).toEqual({ text: 'Your site is up. 1 thing needs you.', tone: 'warn' });
        expect(verdictFor({ needs: 3, decision: true, systemOk: true })).toEqual({
            text: 'Your site is up. 3 things need you, one of them a decision only you can make.',
            tone: 'bad',
        });
    });

    it('turns red and drops "up" when a check is not healthy', () => {
        expect(verdictFor({ needs: 0, decision: false, systemOk: false })).toEqual({ text: 'Part of the system is not healthy.', tone: 'bad' });
        expect(verdictFor({ needs: 1, decision: false, systemOk: false }).text).toBe('Part of the system is not healthy, and 1 thing needs you.');
    });
});

describe('systemOk', () => {
    it('is true only when every reported check is healthy', () => {
        expect(systemOk(['Healthy', 'Healthy'])).toBe(true);
        expect(systemOk(['Healthy', 'Degraded'])).toBe(false);
        expect(systemOk(['Healthy', undefined])).toBe(true);
    });

    it('is null when nothing was reported', () => {
        expect(systemOk([undefined, undefined])).toBeNull();
    });
});

describe('systemVerdict', () => {
    it('is All systems normal with nothing off', () => {
        expect(systemVerdict(['ok', 'none', 'ok'])).toEqual({ text: 'All systems normal', tone: 'ok' });
    });

    it('counts warnings, and goes red when one is bad', () => {
        expect(systemVerdict(['ok', 'warn'])).toEqual({ text: '1 warning', tone: 'warn' });
        expect(systemVerdict(['warn', 'bad'])).toEqual({ text: '2 warnings', tone: 'bad' });
    });
});

describe('runnerState', () => {
    it('is running when a run is Running or Pending', () => {
        expect(runnerState([{ status: 'Succeeded' }, { status: 'Running' }])).toBe('running a workflow');
        expect(runnerState([{ status: 'Pending' }])).toBe('running a workflow');
    });

    it('is idle otherwise', () => {
        expect(runnerState([{ status: 'Failed' }, {}])).toBe('idle');
        expect(runnerState([])).toBe('idle');
    });
});
