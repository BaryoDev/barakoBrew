import { describe, it, expect } from 'vitest';
import { changeOver, durationMs, firstName, greeting, sparkBars } from './overview';

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

    it('is the percent change against the range before', () => {
        expect(changeOver(sample([daysAgo(1), daysAgo(2), daysAgo(3), daysAgo(8)]), 7, NOW)).toEqual({ text: '+200%', direction: 'up' });
        expect(changeOver(sample([daysAgo(1), daysAgo(8), daysAgo(9), daysAgo(10)]), 7, NOW)).toEqual({ text: '−67%', direction: 'down' });
    });

    it('says how many arrived when there was nothing before', () => {
        expect(changeOver(sample([daysAgo(1), daysAgo(2)]), 7, NOW)).toEqual({ text: '+2 new', direction: 'up' });
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
