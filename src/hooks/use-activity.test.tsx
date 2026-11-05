import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => 'cafe' }));

const { api } = await import('@/lib/api');
const { useActivity, activityDelay, isActivityUnavailable, ACTIVITY_POLL_MS } = await import('./use-activity');

function httpError(status: number) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        statusText: '',
        data: {},
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

function run(live = true) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
    );
    return renderHook(() => useActivity({ live }), { wrapper });
}

beforeEach(() => vi.mocked(api.get).mockReset());

describe('useActivity', () => {
    it('reads the newest page from GET /api/activity', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { items: [{ id: 'a', at: '2026-11-06T10:00:00Z', kind: 'published', severity: 'info', text: 'Published an entry.' }], cursor: 'c', hasMore: false },
        });
        const { result } = run();
        await waitFor(() => expect(result.current.items).toHaveLength(1));
        expect(api.get).toHaveBeenCalledWith('/api/activity', { params: { pageSize: 50 } });
        expect(result.current.available).toBe(true);
    });

    it('is unavailable on a 404, an API without the feed', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(404));
        const { result } = run();
        await waitFor(() => expect(result.current.available).toBe(false));
        expect(result.current.isError).toBe(false);
        expect(result.current.items).toEqual([]);
    });

    it('is unavailable on a 403, a caller who may not read it', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(403));
        const { result } = run();
        await waitFor(() => expect(result.current.available).toBe(false));
    });

    it('stays available, as an error, after a 500', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(500));
        const { result } = run();
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.available).toBe(true);
    });

    it('treats a body that is not a page as an error rather than an empty feed', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(api.get).mockResolvedValue({ data: { nothing: true } });
        const { result } = run();
        await waitFor(() => expect(result.current.isError).toBe(true));
    });
});

describe('the poll pace', () => {
    it('is five seconds, doubling after each failure up to a minute', () => {
        expect(activityDelay(0)).toBe(ACTIVITY_POLL_MS);
        expect(activityDelay(1)).toBe(2 * ACTIVITY_POLL_MS);
        expect(activityDelay(2)).toBe(4 * ACTIVITY_POLL_MS);
        expect(activityDelay(10)).toBe(60_000);
    });

    it('stops for a 401, 403 or 404 and for nothing else', () => {
        expect(isActivityUnavailable(httpError(404))).toBe(true);
        expect(isActivityUnavailable(httpError(403))).toBe(true);
        expect(isActivityUnavailable(httpError(401))).toBe(true);
        expect(isActivityUnavailable(httpError(500))).toBe(false);
        expect(isActivityUnavailable(new Error('network'))).toBe(false);
    });
});
