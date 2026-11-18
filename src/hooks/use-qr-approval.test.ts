import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AxiosError } from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { post: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { useQrApproval, createQrApprovalApi, POLL_FLOOR_MS } = await import('./use-qr-approval');

const CREATE = {
    qrPayload: 'request:r1',
    matchNumber: '482913',
    secret: 'browser-secret',
    requestId: 'r1',
    expiresInSeconds: 120,
    intervalSeconds: 2,
};

function tooManyRequests() {
    return new AxiosError('slow down', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {},
        data: {},
        config: {} as never,
    });
}

function tooManyRequestsAfter(seconds: string) {
    const error = tooManyRequests();
    (error.response as { headers: Record<string, string> }).headers = { 'retry-after': seconds };
    return error;
}

function setup(overrides: Partial<typeof CREATE> = {}) {
    const create = vi.fn().mockResolvedValue({ ...CREATE, ...overrides });
    const poll = vi.fn().mockResolvedValue({ status: 'pending' });
    const onApproved = vi.fn();
    const view = renderHook(() => useQrApproval({ create, poll }, onApproved));
    return { create, poll, onApproved, ...view };
}

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const flush = () => act(async () => {});

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe('useQrApproval', () => {
    it('polls_with_the_secret_in_the_body_not_the_url', async () => {
        vi.mocked(api.post).mockImplementation((async (url: string) =>
            url.endsWith('/create') ? { data: CREATE } : { data: { status: 'pending' } }) as never);
        const client = createQrApprovalApi({ createPath: '/api/x/create', pollPath: '/api/x/poll' });
        renderHook(() => useQrApproval(client, vi.fn()));
        await flush();
        await advance(2000);

        const polls = vi.mocked(api.post).mock.calls.filter(([url]) => url === '/api/x/poll');
        expect(polls).toHaveLength(1);
        expect(polls[0][1]).toEqual({ secret: 'browser-secret', requestId: 'r1' });
        for (const call of vi.mocked(api.post).mock.calls) {
            expect(String(call[0])).not.toContain('browser-secret');
            expect(JSON.stringify(call[2] ?? {})).not.toContain('browser-secret');
        }
    });

    it('never_polls_faster_than_the_floor', async () => {
        const { poll } = setup({ intervalSeconds: 0.01 });
        await flush();

        await advance(POLL_FLOOR_MS - 1);
        expect(poll).not.toHaveBeenCalled();
        await advance(1);
        expect(poll).toHaveBeenCalledTimes(1);

        poll.mockResolvedValue({ status: 'pending', intervalSeconds: 0.001 });
        await advance(POLL_FLOOR_MS);
        expect(poll).toHaveBeenCalledTimes(2);
        await advance(POLL_FLOOR_MS - 1);
        expect(poll).toHaveBeenCalledTimes(2);
    });

    it('backs_off_on_429', async () => {
        const { poll, result } = setup();
        poll.mockRejectedValue(tooManyRequests());
        await flush();

        await advance(2000);
        expect(poll).toHaveBeenCalledTimes(1);
        // The wait doubles from the interval, and a 429 is not an error state.
        await advance(3999);
        expect(poll).toHaveBeenCalledTimes(1);
        await advance(1);
        expect(poll).toHaveBeenCalledTimes(2);
        await advance(7999);
        expect(poll).toHaveBeenCalledTimes(2);
        await advance(1);
        expect(poll).toHaveBeenCalledTimes(3);
        expect(result.current.phase).toBe('waiting');
    });

    it('ignores_a_reply_for_an_abandoned_request', async () => {
        const { poll, create, onApproved, result } = setup();
        let answerOld: (value: unknown) => void = () => {};
        poll.mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve)));
        await flush();
        await advance(2000);
        expect(poll).toHaveBeenCalledTimes(1);

        create.mockResolvedValue({ ...CREATE, qrPayload: 'request:r2', matchNumber: '111222', requestId: 'r2' });
        act(() => result.current.showNewCode());
        await flush();
        expect(result.current.request?.matchNumber).toBe('111222');

        await act(async () => answerOld({ status: 'approved', token: 'stale-token' }));

        expect(onApproved).not.toHaveBeenCalled();
        expect(result.current.phase).toBe('waiting');
        expect(result.current.request?.matchNumber).toBe('111222');
    });

    it('stops_at_expiry_and_asks_for_nothing_more', async () => {
        const { poll, result } = setup({ expiresInSeconds: 5 });
        await flush();
        await advance(5000);
        expect(result.current.phase).toBe('expired');
        const calls = poll.mock.calls.length;
        await advance(20_000);
        expect(poll).toHaveBeenCalledTimes(calls);
    });

    it('treats_a_malformed_create_reply_as_a_network_error', async () => {
        const { poll, result } = setup({ matchNumber: '<b>x</b>' });
        await flush();
        await advance(10_000);
        expect(result.current.phase).toBe('error');
        expect(poll).not.toHaveBeenCalled();
    });

    it('clamps_a_huge_interval_to_thirty_seconds', async () => {
        const { poll } = setup({ intervalSeconds: 3_000_000 });
        await flush();

        await advance(29_999);
        expect(poll).not.toHaveBeenCalled();
        await advance(1);
        expect(poll).toHaveBeenCalledTimes(1);

        poll.mockResolvedValue({ status: 'pending', intervalSeconds: 3_000_000 });
        await advance(30_000);
        expect(poll).toHaveBeenCalledTimes(2);
        await advance(29_999);
        expect(poll).toHaveBeenCalledTimes(2);
    });

    it('a_new_code_while_a_poll_is_open_does_not_start_a_second_poll', async () => {
        const { poll, create, onApproved, result } = setup();
        let answerOld: (value: unknown) => void = () => {};
        poll.mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve)));
        await flush();
        await advance(2000);
        expect(poll).toHaveBeenCalledTimes(1);

        create.mockResolvedValue({ ...CREATE, qrPayload: 'request:r2', requestId: 'r2' });
        act(() => result.current.showNewCode());
        await flush();
        await advance(20_000);
        // The old poll is still open, so the new request waits rather than run a second one.
        expect(poll).toHaveBeenCalledTimes(1);

        await act(async () => answerOld({ status: 'approved', token: 'stale-token' }));
        expect(onApproved).not.toHaveBeenCalled();
        await advance(2000);
        expect(poll).toHaveBeenCalledTimes(2);
        expect(poll).toHaveBeenLastCalledWith({ secret: 'browser-secret', requestId: 'r2' });
    });

    it('honours_retry_after_and_caps_it', async () => {
        const { poll } = setup();
        poll.mockRejectedValueOnce(tooManyRequestsAfter('20')).mockRejectedValueOnce(tooManyRequestsAfter('99999'));
        await flush();

        await advance(2000);
        expect(poll).toHaveBeenCalledTimes(1);
        await advance(19_999);
        expect(poll).toHaveBeenCalledTimes(1);
        await advance(1);
        expect(poll).toHaveBeenCalledTimes(2);

        await advance(29_999);
        expect(poll).toHaveBeenCalledTimes(2);
        await advance(1);
        expect(poll).toHaveBeenCalledTimes(3);
    });
});
