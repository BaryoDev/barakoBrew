import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => 'default' }));

const { api } = await import('@/lib/api');
const { useSetLifecycle } = await import('./use-schemas');

const VERSION = '7d3f6a52-1c1e-4b6e-9a53-0d1f2b3c4d5e';
const LIFECYCLE = {
    states: ['Recorded', 'Approved'],
    initialState: 'Recorded',
    transitions: [{ name: 'Approve', from: 'Recorded', to: 'Approved' }],
};

function refusal(status: number, data: unknown) {
    return new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        statusText: '',
        headers: {},
        config: {} as never,
        data,
    });
}

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSetLifecycle('article'), { wrapper });
    return { result, invalidate };
}

const ok = (over: Record<string, unknown>) => ({
    data: { name: 'article', version: VERSION, lifecycle: LIFECYCLE, dryRun: false, changed: true, canApply: true, blockers: [], warnings: [], ...over },
});

beforeEach(() => vi.clearAllMocks());

describe('useSetLifecycle', () => {
    it('sends a dry run with no If-Match even when it is given a version, and does not invalidate', async () => {
        vi.mocked(api.put).mockResolvedValue(ok({ dryRun: true }));
        const { result, invalidate } = setup();

        result.current.mutate({ lifecycle: LIFECYCLE, dryRun: true, version: VERSION });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(api.put).toHaveBeenCalledWith('/api/content-types/article/lifecycle', { lifecycle: LIFECYCLE, dryRun: true }, undefined);
        expect(invalidate).not.toHaveBeenCalled();
    });

    it('sends a save with the version as a quoted If-Match and invalidates the schema list on a stored change', async () => {
        vi.mocked(api.put).mockResolvedValue(ok({}));
        const { result, invalidate } = setup();

        result.current.mutate({ lifecycle: LIFECYCLE, dryRun: false, version: VERSION });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(api.put).toHaveBeenCalledWith(
            '/api/content-types/article/lifecycle',
            { lifecycle: LIFECYCLE, dryRun: false },
            { headers: { 'If-Match': `"${VERSION}"` } },
        );
        expect(result.current.data).toMatchObject({ kind: 'answered', result: { changed: true } });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['schemas'] });
    });

    it('does not invalidate when a save changed nothing', async () => {
        vi.mocked(api.put).mockResolvedValue(ok({ changed: false }));
        const { result, invalidate } = setup();

        result.current.mutate({ lifecycle: LIFECYCLE, dryRun: false, version: VERSION });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(invalidate).not.toHaveBeenCalled();
    });

    it('returns the blockers of a 409 instead of throwing', async () => {
        const blocker = { kind: 'entryState', state: 'Approved', count: 3, message: 'Entries are in Approved.' };
        vi.mocked(api.put).mockRejectedValue(
            refusal(409, { errors: [{ name: 'entryState', reason: blocker.message }], blockers: [blocker], warnings: [] }),
        );
        const { result } = setup();

        result.current.mutate({ lifecycle: LIFECYCLE, dryRun: false, version: VERSION });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ kind: 'blocked', errors: [blocker.message], blockers: [blocker], warnings: [] });
    });

    it('returns the stored lifecycle and version of a 412 and refreshes the list', async () => {
        vi.mocked(api.put).mockRejectedValue(refusal(412, { errors: [{ name: 'ifMatch', reason: 'stale' }], lifecycle: LIFECYCLE, version: VERSION }));
        const { result, invalidate } = setup();

        result.current.mutate({ lifecycle: LIFECYCLE, dryRun: false, version: 'old' });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ kind: 'stale', errors: ['stale'], lifecycle: LIFECYCLE, version: VERSION });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['schemas'] });
    });

    it('throws on a 400 so the caller reads its sentence', async () => {
        vi.mocked(api.put).mockRejectedValue(refusal(400, { errors: [{ name: 'lifecycle', reason: 'Bad.' }] }));
        const { result } = setup();

        result.current.mutate({ lifecycle: LIFECYCLE, dryRun: true });

        await waitFor(() => expect(result.current.isError).toBe(true));
    });
});
