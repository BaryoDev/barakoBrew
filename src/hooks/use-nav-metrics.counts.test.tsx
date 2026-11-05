import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NAV_GROUPS } from '@/lib/navigation';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { useNavMetrics } = await import('./use-nav-metrics');

const TOTALS: Record<string, number> = {
    '/api/contents': 9,
    '/api/workflows': 4,
};

const RUN_COUNTS = { Succeeded: 40, Running: 3, Failed: 2, PartiallyFailed: 1, Cancelled: 5 };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/workflow-runs') return { data: { items: [], totalItems: 51, statusCounts: RUN_COUNTS } };
        if (url in TOTALS) return { data: { items: [], totalItems: TOTALS[url] } };
        throw new Error(`unexpected ${url}`);
    });
});

function metricsFor(hrefs: string[]) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );
    return renderHook(() => useNavMetrics(new Set(hrefs)), { wrapper });
}

describe('the sidebar counts', () => {
    it('count Entries and Workflows from the totals, and Workflow runs from Failed plus Partly failed', async () => {
        const { result } = metricsFor(['/content', '/workflows', '/workflow-runs']);
        await waitFor(() => expect(result.current.workflowRuns).toBeDefined());
        expect(result.current.entries?.value).toBe(9);
        expect(result.current.workflows?.value).toBe(4);
        expect(result.current.workflowRuns?.value).toBe(3);
    });

    it('ask for one row each, never the list', async () => {
        const { result } = metricsFor(['/content', '/workflows', '/workflow-runs']);
        await waitFor(() => expect(result.current.workflowRuns).toBeDefined());
        const calls = vi.mocked(api.get).mock.calls;
        expect(calls).toHaveLength(3);
        for (const [, config] of calls) {
            expect((config as { params: { pageSize: number } }).params.pageSize).toBe(1);
        }
    });

    it('show no Workflow runs count when the API sends no status counts', async () => {
        vi.mocked(api.get).mockImplementation(async (url: string) => ({
            data: { items: [], totalItems: url === '/api/workflow-runs' ? 9 : 1 },
        }));
        const { result } = metricsFor(['/content', '/workflow-runs']);
        await waitFor(() => expect(result.current.entries).toBeDefined());
        expect(result.current.workflowRuns).toBeUndefined();
    });

    it('fetch nothing for a destination the caller is not offered', () => {
        metricsFor(['/content']);
        expect(vi.mocked(api.get).mock.calls.map(([url]) => url)).toEqual(['/api/contents']);
    });

    it('show nothing when the request fails', async () => {
        vi.mocked(api.get).mockRejectedValue(new Error('boom'));
        const { result } = metricsFor(['/workflow-runs']);
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        expect(result.current.workflowRuns).toBeUndefined();
    });
});

describe('the rail layout', () => {
    it('lists Workflow runs among the primary items with a count', () => {
        const primary = NAV_GROUPS[0].items;
        const runs = primary.find((i) => i.href === '/workflow-runs');
        expect(runs?.metric).toBe('workflowRuns');
        expect(primary.map((i) => i.title)).toEqual(expect.arrayContaining(['Entries', 'Workflows', 'Workflow runs']));
    });

    it('keeps the attention tone on Email events, which the Modules group shows as a dot', () => {
        const modules = NAV_GROUPS.find((g) => g.label === 'Modules');
        expect(modules?.items.find((i) => i.href === '/email-events')?.tone).toBe('warning');
    });
});
