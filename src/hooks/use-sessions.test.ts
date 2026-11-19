import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
        beginSignOut: vi.fn(),
        cancelSignOut: vi.fn(),
        refreshSession: vi.fn(),
    };
});

const { api, beginSignOut, cancelSignOut, refreshSession, tokenStore } = await import('@/lib/api');
const {
    useMySessions,
    useEndMySession,
    useEndOtherSessions,
    useUserSessions,
    useEndUserSession,
    useEndAllUserSessions,
    useSessionsGone,
} = await import('./use-sessions');

const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

const SESSION_A = {
    id: ID_A,
    device: 'Chrome on macOS',
    signInMethod: 'password',
    signInIp: '203.0.113.24',
    lastSeenIp: '203.0.113.25',
    startedAt: '2026-11-01T08:00:00Z',
    lastSeenAt: '2026-11-01T09:00:00Z',
    current: true,
};
const SESSION_B = { ...SESSION_A, id: ID_B, device: 'Safari on iPhone', current: false };

function page(items: unknown[]) {
    return { items, page: 1, pageSize: 100, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
}

function httpError(status: number) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data: {},
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    return { wrapper, invalidate };
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
});

describe('useMySessions', () => {
    it('parses the list and keeps the current marker', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: page([SESSION_A, SESSION_B]) });
        const { wrapper } = setup();

        const { result } = renderHook(() => useMySessions(), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(api.get).toHaveBeenCalledWith('/api/me/sessions', { params: { pageSize: 100 } });
        expect(result.current.data?.items.map((s) => [s.id, s.current])).toEqual([[ID_A, true], [ID_B, false]]);
        expect(result.current.data?.items[0].device).toBe('Chrome on macOS');
    });

    it('lists a session with the optional parts missing or null', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: page([{ id: ID_A, device: null, signInIp: 7, startedAt: '2026-11-01T08:00:00Z', lastSeenAt: '2026-11-01T09:00:00Z' }]),
        });
        const { wrapper } = setup();

        const { result } = renderHook(() => useMySessions(), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.items[0]).toMatchObject({ id: ID_A, device: undefined, signInIp: undefined, current: false });
    });

    it('fails on a list in the wrong shape rather than showing a guess', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: page([{ device: 'No id' }]) });
        const { wrapper } = setup();
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useMySessions(), { wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('answers null for a 404, which is an API without the routes, and not an error', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(404));
        const { wrapper } = setup();

        const { result } = renderHook(() => useMySessions(), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toBeNull();
        expect(result.current.isError).toBe(false);
    });

    it('keeps any other failure an error', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(500));
        const { wrapper } = setup();

        const { result } = renderHook(() => useMySessions(), { wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
    });
});

describe('ending my own sessions', () => {
    it('sends the end call for the one session and refreshes the list', async () => {
        vi.mocked(api.delete).mockResolvedValue({ data: undefined });
        const { wrapper, invalidate } = setup();

        const { result } = renderHook(() => useEndMySession(), { wrapper });
        await result.current.mutateAsync({ id: ID_B });

        expect(api.delete).toHaveBeenCalledWith(`/api/me/sessions/${ID_B}`);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sessions'] });
    });

    it('sends the end-others call and refreshes the list', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: undefined });
        const { wrapper, invalidate } = setup();

        const { result } = renderHook(() => useEndOtherSessions(), { wrapper });
        await result.current.mutateAsync();

        expect(api.post).toHaveBeenCalledWith('/api/me/sessions/revoke-others');
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sessions'] });
    });

    it('ends the current session without reading the list again, and marks sign-out first', async () => {
        const order: string[] = [];
        vi.mocked(beginSignOut).mockImplementation(() => void order.push('begin'));
        vi.mocked(api.delete).mockImplementation(async () => {
            order.push('delete');
            return { data: undefined };
        });
        const { wrapper, invalidate } = setup();

        const { result } = renderHook(() => useEndMySession(), { wrapper });
        await result.current.mutateAsync({ id: ID_A, current: true });

        expect(invalidate).not.toHaveBeenCalled();
        expect(order).toEqual(['begin', 'delete']);
    });

    it('refreshes an expired access token before ending the current session', async () => {
        const order: string[] = [];
        const expired = `x.${btoa(JSON.stringify({ exp: 1 }))}.y`;
        const tokenSpy = vi.spyOn(tokenStore, 'token', 'get').mockReturnValue(expired);
        vi.mocked(refreshSession).mockImplementation(async () => {
            order.push('refresh');
            return 'fresh';
        });
        vi.mocked(beginSignOut).mockImplementation(() => void order.push('begin'));
        vi.mocked(api.delete).mockImplementation(async () => {
            order.push('delete');
            return { data: undefined };
        });
        const { wrapper } = setup();

        const { result } = renderHook(() => useEndMySession(), { wrapper });
        await result.current.mutateAsync({ id: ID_A, current: true });

        expect(order).toEqual(['refresh', 'begin', 'delete']);
        tokenSpy.mockRestore();
    });

    it('sends no DELETE when the refresh finds the session already gone', async () => {
        const expired = `x.${btoa(JSON.stringify({ exp: 1 }))}.y`;
        const tokenSpy = vi.spyOn(tokenStore, 'token', 'get').mockReturnValue(expired);
        vi.mocked(refreshSession).mockResolvedValue(null);
        vi.mocked(beginSignOut).mockClear();
        vi.mocked(api.delete).mockClear();
        const { wrapper } = setup();

        const { result } = renderHook(() => useEndMySession(), { wrapper });
        const out = await result.current.mutateAsync({ id: ID_A, current: true });

        expect(out).toEqual({ current: true, revoked: false });
        expect(api.delete).not.toHaveBeenCalled();
        expect(beginSignOut).not.toHaveBeenCalled();
        tokenSpy.mockRestore();
    });

    it('lets automatic refresh run again when ending the current session fails', async () => {
        vi.mocked(api.delete).mockRejectedValue(httpError(500));
        const { wrapper } = setup();

        const { result } = renderHook(() => useEndMySession(), { wrapper });
        await expect(result.current.mutateAsync({ id: ID_A, current: true })).rejects.toBeTruthy();

        expect(cancelSignOut).toHaveBeenCalled();
    });

    it('does not mark sign-out for another session', async () => {
        vi.mocked(api.delete).mockResolvedValue({ data: undefined });
        vi.mocked(beginSignOut).mockClear();
        const { wrapper } = setup();

        const { result } = renderHook(() => useEndMySession(), { wrapper });
        await result.current.mutateAsync({ id: ID_B });

        expect(beginSignOut).not.toHaveBeenCalled();
    });

    it('reports whether the list has more than one page', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { ...page([SESSION_A]), hasNextPage: true } });
        const { wrapper } = setup();

        const { result } = renderHook(() => useMySessions(), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.more).toBe(true);
    });

    it('does not refresh the list when the call fails', async () => {
        vi.mocked(api.delete).mockRejectedValue(httpError(500));
        const { wrapper, invalidate } = setup();

        const { result } = renderHook(() => useEndMySession(), { wrapper });
        await expect(result.current.mutateAsync({ id: ID_B })).rejects.toBeTruthy();

        expect(invalidate).not.toHaveBeenCalled();
    });
});

describe('another user\'s sessions', () => {
    it('reads the list from the user route', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: page([SESSION_B]) });
        const { wrapper } = setup();

        const { result } = renderHook(() => useUserSessions(USER), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(api.get).toHaveBeenCalledWith(`/api/users/${USER}/sessions`, { params: { pageSize: 100 } });
        expect(result.current.data?.items[0].id).toBe(ID_B);
    });

    it('asks for nothing until a user is chosen', () => {
        const { wrapper } = setup();
        renderHook(() => useUserSessions(null), { wrapper });
        expect(api.get).not.toHaveBeenCalled();
    });

    it('keeps a 403 an error, so the panel can say so', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(403));
        const { wrapper } = setup();

        const { result } = renderHook(() => useUserSessions(USER), { wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('ends one session and all of them, refreshing the list after each', async () => {
        vi.mocked(api.delete).mockResolvedValue({ data: undefined });
        const { wrapper, invalidate } = setup();

        const one = renderHook(() => useEndUserSession(), { wrapper });
        await one.result.current.mutateAsync({ userId: USER, sessionId: ID_A });
        expect(api.delete).toHaveBeenLastCalledWith(`/api/users/${USER}/sessions/${ID_A}`);
        expect(invalidate).toHaveBeenCalledTimes(1);

        const all = renderHook(() => useEndAllUserSessions(), { wrapper });
        await all.result.current.mutateAsync(USER);
        expect(api.delete).toHaveBeenLastCalledWith(`/api/users/${USER}/sessions`);
        expect(invalidate).toHaveBeenCalledTimes(2);
        expect(invalidate).toHaveBeenLastCalledWith({ queryKey: ['sessions'] });
    });
});

describe('useSessionsGone', () => {
    it('is true only when the API answers 404', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(404));
        const { wrapper } = setup();

        const { result } = renderHook(() => useSessionsGone(true), { wrapper });

        await waitFor(() => expect(result.current).toBe(true));
        expect(api.get).toHaveBeenCalledWith('/api/me/sessions', { params: { pageSize: 1 } });
    });

    it('stays false when the routes answer, and when the answer is another failure', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(500));
        const { wrapper } = setup();

        const { result } = renderHook(() => useSessionsGone(true), { wrapper });

        await waitFor(() => expect(api.get).toHaveBeenCalled());
        expect(result.current).toBe(false);
    });

    it('does not ask when not enabled', () => {
        const { wrapper } = setup();
        renderHook(() => useSessionsGone(false), { wrapper });
        expect(api.get).not.toHaveBeenCalled();
    });
});
