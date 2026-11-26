import { describe, it, expect } from 'vitest';
import { parseModuleCards, parseModuleCardContent } from './module-cards';

const card = (over: Record<string, unknown> = {}) => ({ id: 'today', title: 'Daily summary', route: '/api/reports/today', ...over });

describe('parseModuleCards', () => {
    it('keeps a valid card', () => {
        expect(parseModuleCards([card()])).toEqual([{ id: 'today', title: 'Daily summary', route: '/api/reports/today' }]);
    });

    it.each([
        ['protocol-relative', '//evil.example/x'],
        ['dot segments', '/api/../x'],
        ['query string', '/api/x?y=1'],
        ['absolute url', 'https://x'],
        ['backslash', '/api/x\\y'],
        ['no api prefix', '/reports/today'],
        ['trailing slash', '/api/x/'],
        ['over 200 chars', '/api/' + 'a'.repeat(200)],
        ['not a string', 42],
    ])('drops a route that is %s', (_name, route) => {
        expect(parseModuleCards([card({ route })])).toEqual([]);
    });

    it.each(['Today', '-today', 'a'.repeat(41), '', 7])('drops a bad id %s', (id) => {
        expect(parseModuleCards([card({ id })])).toEqual([]);
    });

    it('drops a route under /api/auth', () => {
        expect(parseModuleCards([card({ route: '/api/auth/refresh' }), card({ route: '/api/auth' })])).toEqual([]);
        expect(parseModuleCards([card({ route: '/api/authors/top' })])).toHaveLength(1);
    });

    it('cuts a title to 60 characters', () => {
        expect(parseModuleCards([card({ title: 't'.repeat(100) })])[0].title).toHaveLength(60);
    });

    it('removes a bidi override from a title', () => {
        expect(parseModuleCards([card({ title: 'Sales\u202Eevil' })])[0].title).toBe('Salesevil');
    });

    it('drops a title made only of zero-width characters', () => {
        expect(parseModuleCards([card({ title: '\u200B\u200D\uFEFF\u2060' })])).toEqual([]);
    });

    it('drops an empty title', () => {
        expect(parseModuleCards([card({ title: '  ' }), card({ title: 3 })])).toEqual([]);
    });

    it('keeps at most 4 per module', () => {
        const many = Array.from({ length: 7 }, (_, i) => card({ id: `c${i}` }));
        expect(parseModuleCards(many).map((c) => c.id)).toEqual(['c0', 'c1', 'c2', 'c3']);
    });

    it('treats a missing or non-array value as no cards', () => {
        expect(parseModuleCards(undefined)).toEqual([]);
        expect(parseModuleCards(null)).toEqual([]);
        expect(parseModuleCards({ 0: card() })).toEqual([]);
        expect(parseModuleCards('x')).toEqual([]);
        expect(parseModuleCards([null, 'x', 3])).toEqual([]);
    });

    it('keeps a valid refresh label, trimmed', () => {
        expect(parseModuleCards([card({ refreshLabel: '  Refresh  ' })])[0].refreshLabel).toBe('Refresh');
        expect(parseModuleCards([card({ refreshLabel: 'a'.repeat(24) })])[0].refreshLabel).toBe('a'.repeat(24));
    });

    it('keeps 12 emoji (24 UTF-16 units)', () => {
        const label = '\u{1F600}'.repeat(12);
        expect(parseModuleCards([card({ refreshLabel: label })])[0].refreshLabel).toBe(label);
    });

    it.each([
        ['25 characters', 'a'.repeat(25)],
        ['empty', ''],
        ['whitespace', '   '],
        ['not a string', 7],
        ['null', null],
        ['control character', 'Re\u0007fresh'],
        ['zero-width character', 'Re\u200Bfresh'],
        ['line separator', 'Re\u2028fresh'],
        ['paragraph separator', 'Re\u2029fresh'],
        ['bidi override', 'Re\u202Efresh'],
        ['13 emoji (26 UTF-16 units)', '\u{1F600}'.repeat(13)],
    ])('drops a refresh label that is %s and keeps the card', (_name, refreshLabel) => {
        const out = parseModuleCards([card({ refreshLabel })]);
        expect(out).toHaveLength(1);
        expect(out[0]).toEqual({ id: 'today', title: 'Daily summary', route: '/api/reports/today' });
        expect('refreshLabel' in out[0]).toBe(false);
    });
});

describe('parseModuleCardContent', () => {
    const ok = (over: Record<string, unknown> = {}) => ({ state: 'ok', text: 'Fine', rows: [], note: null, updatedAt: null, ...over });

    it('reads a full answer', () => {
        const content = parseModuleCardContent(
            ok({ rows: [{ label: 'Sales', value: '12' }], note: 'Cached', updatedAt: '2026-11-24T10:00:00Z' }),
        );
        expect(content?.state).toBe('ok');
        expect(content?.rows).toEqual([{ label: 'Sales', value: '12' }]);
        expect(content?.note).toBe('Cached');
        expect(content?.updatedAt?.toISOString()).toBe('2026-11-24T10:00:00.000Z');
    });

    it('rejects an unknown state or a non-object', () => {
        expect(parseModuleCardContent(ok({ state: 'weird' }))).toBeNull();
        expect(parseModuleCardContent(ok({ state: undefined }))).toBeNull();
        expect(parseModuleCardContent('ok')).toBeNull();
        expect(parseModuleCardContent(null)).toBeNull();
        expect(parseModuleCardContent([])).toBeNull();
    });

    it('cuts text, rows, labels, values and the note', () => {
        const rows = Array.from({ length: 20 }, (_, i) => ({ label: 'l'.repeat(100) + i, value: 'v'.repeat(300) }));
        const content = parseModuleCardContent(ok({ text: 't'.repeat(5000), rows, note: 'n'.repeat(500) }))!;
        expect(content.text).toHaveLength(1000);
        expect(content.rows).toHaveLength(12);
        expect(content.rows[0].label).toHaveLength(60);
        expect(content.rows[0].value).toHaveLength(120);
        expect(content.note).toHaveLength(200);
    });

    it('strips control characters', () => {
        const content = parseModuleCardContent(
            ok({ text: 'a\u0000b\u001bc\u0085d\u2028', rows: [{ label: 'x\u0007y', value: 'one\ntwo' }], note: '\u0001' }),
        )!;
        expect(content.text).toBe('abcd');
        expect(content.rows).toEqual([{ label: 'xy', value: 'one two' }]);
        expect(content.note).toBeNull();
    });

    it('drops non-string values and bad rows', () => {
        const content = parseModuleCardContent(
            ok({ text: 5, rows: [{ label: 'a', value: 1 }, { label: 2, value: 'b' }, null, { label: 'c', value: 'd' }], note: {}, updatedAt: 'nope' }),
        )!;
        expect(content.text).toBe('');
        expect(content.rows).toEqual([{ label: 'c', value: 'd' }]);
        expect(content.note).toBeNull();
        expect(content.updatedAt).toBeNull();
    });
});

describe('visual parts', () => {
    const ok = (over: Record<string, unknown> = {}) => ({ state: 'ok', text: 'Fine', rows: [], note: null, updatedAt: null, ...over });
    const stat = (over: Record<string, unknown> = {}) => ({ label: 'Rainfall', value: 12, ...over });
    const days = (n: number) =>
        // December, so 31 points are 31 real days.
        Array.from({ length: n }, (_, i) => ({ date: `2026-12-${String(i + 1).padStart(2, '0')}`, value: i, previous: i + 1 }));
    const question = (over: Record<string, unknown> = {}) => ({ route: '/api/weather/question', placeholder: 'Type a question', ...over });
    const bomb = '<img src=x onerror=alert(1)>';

    it('reads every part with the spec caps', () => {
        const content = parseModuleCardContent(
            ok({
                stats: Array.from({ length: 6 }, (_, i) => stat({ label: `Tile ${i}` })),
                series: { label: 'Rainfall', points: days(7), previousLabel: 'Last week' },
                bars: { label: 'Wettest towns', items: Array.from({ length: 9 }, (_, i) => ({ label: `Town ${i}`, value: i })) },
                checks: Array.from({ length: 8 }, (_, i) => ({ label: `Sensor ${i}`, tone: 'ok' })),
                rowsLabel: 'Readings',
                question: question(),
            }),
        )!;
        expect(content.stats).toHaveLength(4);
        expect(content.series?.points).toHaveLength(7);
        expect(content.series?.previousLabel).toBe('Last week');
        expect(content.bars?.items).toHaveLength(8);
        expect(content.checks).toHaveLength(6);
        expect(content.rowsLabel).toBe('Readings');
        expect(content.question?.route).toBe('/api/weather/question');
    });

    it('drops a series over 31 points or under 2', () => {
        expect(parseModuleCardContent(ok({ series: { label: 'Rainfall', points: days(40) } }))!.series).toBeUndefined();
        expect(parseModuleCardContent(ok({ series: { label: 'Rainfall', points: days(1) } }))!.series).toBeUndefined();
        expect(parseModuleCardContent(ok({ series: { label: 'Rainfall', points: days(31) } }))!.series?.points).toHaveLength(31);
    });

    it('drops a rows label over 40 characters and falls back to Details', () => {
        const content = parseModuleCardContent(ok({ stats: [stat()], rowsLabel: 'x'.repeat(41) }))!;
        expect(content.rowsLabel).toBe('Details');
    });

    it('sets no rows label without a visual part', () => {
        const content = parseModuleCardContent(ok({ rowsLabel: 'Readings', question: question() }))!;
        expect(content.rowsLabel).toBeUndefined();
    });

    it('reads parts only from an ok answer', () => {
        const content = parseModuleCardContent(ok({ state: 'empty', stats: [stat()], question: question() }))!;
        expect(content.stats).toBeUndefined();
        expect(content.question).toBeUndefined();
    });

    it.each([
        ['negative', { value: -1 }],
        ['NaN', { value: Number.NaN }],
        ['Infinity', { value: Number.POSITIVE_INFINITY }],
        ['string number', { value: '12' }],
        ['negative previous', { previous: -3 }],
        ['string total', { total: '5' }],
        ['bad format', { format: 'ratio' }],
        ['bad goodWhen', { goodWhen: 'sideways' }],
    ])('drops a stat with a %s and keeps the card', (_name, over) => {
        const content = parseModuleCardContent(ok({ stats: [stat(over), stat({ label: 'Sunny days' })] }))!;
        expect(content.stats).toEqual([{ label: 'Sunny days', value: 12, format: 'count' }]);
    });

    it('drops a point with a bad date or number and a check with a bad tone', () => {
        const points = [
            { date: '2026-13-45', value: 1 },
            { date: '2026-11-01', value: -1 },
            { date: '2026-11-02', value: '3' },
            { date: '2026-11-03', value: 3 },
            { date: '2026-11-04', value: 4 },
        ];
        const content = parseModuleCardContent(
            ok({
                series: { label: 'Rainfall', points },
                checks: [{ label: 'Gauge', tone: 'fine' }, { label: 'Radar', tone: 'warn', value: 'slow' }],
                bars: { label: 'Towns', items: [{ label: 'A', value: Number.NaN }, { label: 'B', value: 2 }] },
            }),
        )!;
        expect(content.series?.points.map((p) => p.date)).toEqual(['2026-11-03', '2026-11-04']);
        expect(content.checks).toEqual([{ label: 'Radar', tone: 'warn', value: 'slow' }]);
        expect(content.bars?.items).toEqual([{ label: 'B', value: 2 }]);
    });

    it('defaults format, maxLength and maxTurns', () => {
        const content = parseModuleCardContent(ok({ stats: [stat()], question: question() }))!;
        expect(content.stats?.[0].format).toBe('count');
        expect(content.question?.maxLength).toBe(500);
        expect(content.question?.maxTurns).toBe(10);
    });

    it('keeps percent format and a total', () => {
        const content = parseModuleCardContent(ok({ stats: [stat({ format: 'percent', total: 5, previous: 4, goodWhen: 'down' })] }))!;
        expect(content.stats?.[0]).toEqual({ label: 'Rainfall', value: 12, format: 'percent', total: 5, previous: 4, goodWhen: 'down' });
    });

    it.each([
        ['an auth route', '/api/auth/login'],
        ['over 200 chars', '/api/' + 'a'.repeat(200)],
        ['an absolute url', 'https://x.test/a'],
        ['protocol-relative', '//x.test'],
        ['not a string', 7],
    ])('rejects a question route that is %s', (_name, route) => {
        expect(parseModuleCardContent(ok({ question: question({ route }) }))!.question).toBeUndefined();
    });

    it('drops a question route outside the card module prefix', () => {
        const value = ok({ question: question({ route: '/api/users/x' }) });
        expect(parseModuleCardContent(value, '/api/foo/card')!.question).toBeUndefined();
        expect(parseModuleCardContent(ok({ question: question({ route: '/api/foo/ask' }) }), '/api/foo/card')!.question?.route).toBe('/api/foo/ask');
    });

    it('drops previous from every point when some points lack it', () => {
        const points = days(4).map((p, i) => (i === 2 ? { date: p.date, value: p.value } : p));
        const series = parseModuleCardContent(ok({ series: { label: 'Rainfall', points, previousLabel: 'Last week' } }))!.series!;
        expect(series.points).toHaveLength(4);
        expect(series.points.every((p) => p.previous === undefined)).toBe(true);
        expect(series.previousLabel).toBeUndefined();
    });

    it('turns a stat value of negative zero into 0', () => {
        const value = parseModuleCardContent(ok({ stats: [stat({ value: -0 })] }))!.stats![0].value;
        expect(Object.is(value, 0)).toBe(true);
    });

    it.each([
        ['maxLength 0', { maxLength: 0 }],
        ['maxLength 1001', { maxLength: 1001 }],
        ['maxTurns 21', { maxTurns: 21 }],
        ['maxTurns -1', { maxTurns: -1 }],
        ['an empty placeholder', { placeholder: '' }],
    ])('drops the question for %s', (_name, over) => {
        expect(parseModuleCardContent(ok({ question: question(over) }))!.question).toBeUndefined();
    });

    it('accepts maxTurns 0 and the largest maxLength', () => {
        const content = parseModuleCardContent(ok({ question: question({ maxTurns: 0, maxLength: 1000 }) }))!;
        expect(content.question).toMatchObject({ maxTurns: 0, maxLength: 1000 });
    });

    it('cleans strings in parts', () => {
        const content = parseModuleCardContent(
            ok({
                stats: [stat({ label: bomb })],
                bars: { label: 'Towns', items: [{ label: `a\u202Eb${'x'.repeat(10000)}`, value: 1 }] },
                checks: [{ label: 'Gauge', tone: 'ok', value: 'y'.repeat(10000) }],
            }),
        )!;
        expect(content.stats?.[0].label).toBe(bomb);
        expect(content.bars?.items[0].label.startsWith('ab')).toBe(true);
        expect(Array.from(content.bars!.items[0].label)).toHaveLength(60);
        expect(Array.from(content.checks![0].value!)).toHaveLength(120);
    });

    it('content without parts has none of the new keys', () => {
        const content = parseModuleCardContent(ok({ stats: [], bars: { label: 'x', items: [] }, checks: 'no' }))!;
        expect(Object.keys(content).sort()).toEqual(['note', 'rows', 'state', 'text', 'updatedAt']);
    });
});
