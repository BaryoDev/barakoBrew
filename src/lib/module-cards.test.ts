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
