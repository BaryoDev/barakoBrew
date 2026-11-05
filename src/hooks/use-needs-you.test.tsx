import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

let feed: { items: unknown[]; available: boolean; isLoading: boolean; isError: boolean };
let failed: { data?: { totalItems: number }; isLoading: boolean; isError: boolean };
let metrics: Record<string, { value: number; atLeast: boolean }>;

vi.mock('@/hooks/use-activity', () => ({ useActivity: () => feed }));
vi.mock('@/hooks/use-overview', () => ({ useRunSample: () => failed }));
vi.mock('@/hooks/use-nav-metrics', () => ({ useNavMetrics: () => metrics }));
vi.mock('@/hooks/use-visible-hrefs', () => ({ useAllowedGroups: () => [], hrefsOf: () => new Set<string>() }));

const { useNeedsYou } = await import('./use-needs-you');

const row = (id: string, kind: string, severity: string, extra: Record<string, unknown> = {}) => ({
    id,
    at: new Date().toISOString(),
    kind,
    severity,
    text: 'A thing.',
    ...extra,
});

beforeEach(() => {
    feed = { items: [], available: true, isLoading: false, isError: false };
    failed = { data: { totalItems: 0 }, isLoading: false, isError: false };
    metrics = {};
});

describe('useNeedsYou', () => {
    it('reads the warnings and errors from the feed, not the counts', () => {
        feed.items = [
            row('r1', 'run.failed', 'error', { text: 'A workflow run failed.', subject: { title: 'Notify Slack' }, ref: '/workflow-runs?run=r1' }),
            row('b1', 'bounced', 'warning', { text: 'An email bounced.' }),
            row('p1', 'published', 'info'),
        ];
        failed = { data: { totalItems: 9 }, isLoading: false, isError: false };
        const { result } = renderHook(() => useNeedsYou());

        expect(result.current.source).toBe('activity');
        expect(result.current.rows.map((r) => r.key)).toEqual(['r1', 'b1']);
        expect(result.current.rows[0]).toMatchObject({ title: 'A workflow run failed.', href: '/workflow-runs?run=r1', decision: true });
        expect(result.current.rows[0].detail).toContain('Notify Slack');
        expect(result.current.rows[1].href).toBe('/email-events');
    });

    it('opens the audit log for a row with an unusable ref and no known kind', () => {
        feed.items = [row('x', 'quota.reached', 'warning', { ref: 'https://evil.example' })];
        const { result } = renderHook(() => useNeedsYou());
        expect(result.current.rows[0].href).toBe('/audit');
    });

    it('adds unresolved errors, which the feed does not carry', () => {
        metrics = { unresolvedErrors: { value: 3, atLeast: false } };
        const { result } = renderHook(() => useNeedsYou());
        expect(result.current.rows.map((r) => r.key)).toEqual(['errors']);
    });

    it('falls back to the counts when the API has no feed', () => {
        feed = { items: [], available: false, isLoading: false, isError: false };
        failed = { data: { totalItems: 2 }, isLoading: false, isError: false };
        metrics = { recentBounces: { value: 1, atLeast: false } };
        const { result } = renderHook(() => useNeedsYou());

        expect(result.current.source).toBe('counts');
        expect(result.current.rows.map((r) => r.key)).toEqual(['runs', 'bounces']);
        expect(result.current.rows[0].title).toBe('2 workflow runs failed');
    });

    it('does not list the bounce count as well when the feed already carries the bounce', () => {
        feed.items = [row('b1', 'bounced', 'warning')];
        metrics = { recentBounces: { value: 1, atLeast: false } };
        const { result } = renderHook(() => useNeedsYou());
        expect(result.current.rows.map((r) => r.key)).toEqual(['b1']);
    });
});
