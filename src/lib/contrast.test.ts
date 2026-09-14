import { describe, expect, it } from 'vitest';
import {
    checkAgainst,
    checkContrast,
    contrastRatio,
    countBelow,
    formatRatio,
    parseHex,
    toLongHex,
} from './contrast';

describe('contrastRatio', () => {
    it('is 21 for black on white and 1 for a colour on itself', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
        expect(contrastRatio('#17458F', '#17458F')).toBeCloseTo(1, 5);
    });

    it('is the same whichever side is the foreground', () => {
        expect(contrastRatio('#F7A81B', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#F7A81B')!, 10);
    });

    it('matches the published WCAG figures for known pairs', () => {
        // #767676 on white is the lightest grey that passes AA, at 4.54:1.
        expect(formatRatio(contrastRatio('#767676', '#FFFFFF')!)).toBe('4.54:1');
        // #777777 is one step lighter and fails, at 4.47:1.
        expect(formatRatio(contrastRatio('#777777', '#FFFFFF')!)).toBe('4.47:1');
    });

    it('reads a three digit hex as its six digit form', () => {
        expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
        expect(parseHex('#abc')).toEqual([0xaa, 0xbb, 0xcc]);
        expect(toLongHex('#ABC')).toBe('#aabbcc');
    });

    it('is null for anything that is not a hex colour', () => {
        expect(contrastRatio('royalblue', '#fff')).toBeNull();
        expect(contrastRatio('#12345', '#fff')).toBeNull();
        expect(contrastRatio('#11223344', '#fff')).toBeNull();
        expect(contrastRatio(undefined, '#fff')).toBeNull();
    });
});

describe('formatRatio', () => {
    it('rounds down, so a pair just under 4.5 never reads as 4.50', () => {
        expect(formatRatio(4.4999)).toBe('4.49:1');
        expect(formatRatio(21)).toBe('21.00:1');
    });
});

describe('checkContrast', () => {
    it('flags the rckoronadal gold as body text on white, and passes the royal blue', () => {
        const results = checkContrast(
            { pageBg: '#FFFFFF', ink: '#F7A81B', accent: '#17458F' },
            [
                { label: 'Body', foreground: 'ink', background: 'pageBg' },
                { label: 'Links', foreground: 'accent', background: 'pageBg' },
            ],
        );

        expect(results).toHaveLength(2);
        expect(results[0].verdict).toBe('below');
        expect(results[1].verdict).toBe('pass');
        expect(countBelow(results)).toBe(1);
    });

    it('reports a pair with a missing or unreadable side without calling it a failure', () => {
        const results = checkContrast({ pageBg: '#fff', ink: 'dark grey' }, [
            { label: 'Body', foreground: 'ink', background: 'pageBg' },
            { label: 'Cards', foreground: 'ink', background: 'surface' },
        ]);

        expect(results.map((r) => r.verdict)).toEqual(['unreadable', 'unset']);
        expect(countBelow(results)).toBe(0);
    });

    it('checks every theme pair by default', () => {
        const results = checkContrast({});
        expect(results.length).toBeGreaterThan(5);
        expect(results.every((r) => r.verdict === 'unset')).toBe(true);
    });
});

describe('checkAgainst', () => {
    it('measures each site colour against the chosen background, skipping the background itself', () => {
        const colors = { pageBg: '#FFFFFF', darkPanel: '#111111', gold: '#F7A81B', cranberry: '#D41367' };

        const onWhite = checkAgainst(colors, ['gold', 'cranberry', 'pageBg'], 'pageBg');
        expect(onWhite).toHaveLength(2);
        expect(onWhite.map((r) => r.verdict)).toEqual(['below', 'pass']);

        const onDark = checkAgainst(colors, ['gold', 'cranberry'], 'darkPanel');
        expect(onDark).toHaveLength(2);
        expect(onDark[0].verdict).toBe('pass');
    });
});
