import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => 'cafe' }));

const { api } = await import('@/lib/api');
const { useActivityGone, useActivity, activityDelay, isActivityUnavailable, ACTIVITY_POLL_MS } = await import('./use-activity');

function httpError(status: number) {
    return Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: { status } });
}

function run(live = true) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useActivity({ live }), { wrapper });
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
});

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

    it('sends the kinds it was asked for, and none when there are none', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [], cursor: 'c', hasMore: false } });
        const client = new QueryClient();
        const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
        renderHook(() => useActivity({ kinds: ['run.failed', 'bounced'] }), { wrapper });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/activity', { params: { pageSize: 50, kinds: 'run.failed,bounced' } }));
    });

    it('does not ask while disabled', async () => {
        const { result } = renderHook(() => useActivity({ enabled: false }), {
            wrapper: ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
            ),
        });
        await new Promise((r) => setTimeout(r, 10));
        expect(api.get).not.toHaveBeenCalled();
        expect(result.current.missing).toBe(false);
    });

    it('says missing only for a 404', async () => {
        vi.mocked(api.get).mockImplementation(async () => { throw httpError(404); });
        const missing = run();
        await waitFor(() => expect(missing.result.current.missing).toBe(true));
        vi.mocked(api.get).mockImplementation(async () => { throw httpError(403); });
        const refused = run();
        await waitFor(() => expect(refused.result.current.available).toBe(false));
        expect(refused.result.current.missing).toBe(false);
    });

    it('is unavailable on a 404, an API without the feed', async () => {
        vi.mocked(api.get).mockImplementation(async () => { throw httpError(404); });
        const { result } = run();
        await waitFor(() => expect(result.current.available).toBe(false));
        expect(result.current.isError).toBe(false);
        expect(result.current.items).toEqual([]);
    });

    it('is unavailable on a 403, a caller who may not read it', async () => {
        vi.mocked(api.get).mockImplementation(async () => { throw httpError(403); });
        const { result } = run();
        await waitFor(() => expect(result.current.available).toBe(false));
    });

    it('stays available, as an error, after a 500', async () => {
        vi.mocked(api.get).mockImplementation(async () => { throw httpError(500); });
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

describe('useActivityGone', () => {
    function probe(enabled = true) {
        const client = new QueryClient();
        const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
        return { client, ...renderHook(() => useActivityGone(enabled), { wrapper }) };
    }

    it('asks for one row on its own key and says gone for a 404, and keeps the answer', async () => {
        vi.mocked(api.get).mockImplementation(async () => { throw httpError(404); });
        const { result, client } = probe();
        await waitFor(() => expect(result.current).toBe(true));
        expect(api.get).toHaveBeenCalledWith('/api/activity', { params: { pageSize: 1 } });
        expect(client.getQueryCache().findAll({ queryKey: ['activity-probe'] })[0]?.state.status).toBe('success');
    });

    it('says gone for a 403 too', async () => {
        vi.mocked(api.get).mockImplementation(async () => { throw httpError(403); });
        const { result } = probe();
        await waitFor(() => expect(result.current).toBe(true));
    });

    it('is not gone when the feed answers, or on a 500', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [] } });
        const ok = probe();
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        expect(ok.result.current).toBe(false);
        vi.mocked(api.get).mockImplementation(async () => { throw httpError(500); });
        const bad = probe();
        await waitFor(() => expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThan(1));
        expect(bad.result.current).toBe(false);
    });

    it('does not ask while the caller is not offered the item', async () => {
        probe(false);
        await new Promise((r) => setTimeout(r, 10));
        expect(api.get).not.toHaveBeenCalled();
    });

    it('asks for a larger page when told to', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [] } });
        const client = new QueryClient();
        renderHook(() => useActivity({ pageSize: 100 }), { wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/activity', { params: { pageSize: 100 } }));
    });
});
