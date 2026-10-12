import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => 'default' }));

const { api, isResponseShapeError } = await import('@/lib/api');
const { useWorkflowRuns, useWorkflowRun } = await import('./use-workflow-runs');

/** A run as Features/WorkflowRuns/RunResponse writes it. */
function run(id: string, status: string) {
    return {
        id,
        workflowDefinitionId: 'wf-1',
        workflowName: 'Announce',
        contentId: 'c1',
        contentType: 'article',
        triggerEvent: 'Created',
        status,
        createdAt: '2026-09-01T00:00:00+00:00',
        completedAt: null,
        cancelledAt: null,
        correlationId: null,
        actions: [
            {
                ordinal: 1,
                actionType: 'Webhook',
                status: 'Pending',
                attempts: 0,
                nextAttemptAt: null,
                responseStatus: null,
                error: null,
                retryable: null,
                completedAt: null,
                durationMs: null,
                onFailure: 'Continue',
                haltedBy: null,
            },
        ],
    };
}

const envelope = (items: unknown[]) => ({
    items,
    page: 1,
    pageSize: 25,
    totalItems: items.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
});

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the run reads', () => {
    it('take every status the filter offers', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: envelope(['Pending', 'Running', 'Succeeded', 'Failed', 'PartiallyFailed', 'Cancelled'].map((s) => run(s, s))),
        });

        const { result } = renderHook(() => useWorkflowRuns({ page: 1 }), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.items).toHaveLength(6);
    });

    it('fail on a run status the filter does not know, so the filter cannot fall behind silently', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: envelope([run('r1', 'Succeeded'), run('r2', 'Paused')]) });

        const { result } = renderHook(() => useWorkflowRuns({ page: 1 }), { wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(isResponseShapeError(result.current.error)).toBe(true);
    });

    it('fail on a run whose actions arrive under another name', async () => {
        const { actions, ...rest } = run('r1', 'Failed');
        vi.mocked(api.get).mockResolvedValue({ data: { ...rest, attempts: actions } });

        const { result } = renderHook(() => useWorkflowRun('r1'), { wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(isResponseShapeError(result.current.error)).toBe(true);
    });
});
