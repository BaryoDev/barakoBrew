import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

/**
 * The poll loop, on fake timers. The clock is the thing under test: when a request goes out, and
 * when it does not.
 */
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const { api, tokenStore } = await import('@/lib/api');
const { useWorkflowRuns, useRetryAttempt, backoffDelay, POLL_INTERVAL_MS, POLL_MAX_BACKOFF_MS } = await import(
  './use-workflow-runs'
);

type Params = Record<string, string | number>;
type Responder = (params: Params) => unknown;

function tokenFor(tenant: string): string {
  return `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ sub: 'u1', tenant }))}.sig`;
}

function run(id: string, created: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    workflowDefinitionId: 'wf-1',
    workflowName: `Workflow ${id}`,
    contentId: 'c1',
    contentType: 'article',
    triggerEvent: 'Created',
    status: 'Succeeded',
    createdAt: `2026-10-19T${created}:00Z`,
    updatedAt: `2026-10-19T${created}:10Z`,
    actions: [],
    ...extra,
  };
}

function page(items: unknown[], extra: Record<string, unknown> = {}) {
  return {
    items,
    page: 1,
    pageSize: 25,
    totalItems: items.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    ...extra,
  };
}

function failure(status: number) {
  return new AxiosError('failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    statusText: '',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

/** Answers the list read and the poll differently, the way the API does. */
function serve(onList: Responder, onPoll: Responder) {
  vi.mocked(api.get).mockImplementation((async (_url: string, config?: { params?: Params }) => {
    const params = config?.params ?? {};
    const body = 'changedSince' in params ? onPoll(params) : onList(params);
    if (body instanceof Error) throw body;
    return { data: body };
  }) as typeof api.get);
}

const paramsOf = (config?: { params?: unknown }) => (config?.params ?? {}) as Params;
const polls = () => vi.mocked(api.get).mock.calls.filter(([, config]) => 'changedSince' in paramsOf(config));
const lists = () => vi.mocked(api.get).mock.calls.filter(([, config]) => !('changedSince' in paramsOf(config)));
const sentCursor = (n: number) => (polls()[n][1]?.params as Params).changedSince;

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mount(query: { page?: number; status?: string } = {}) {
  return renderHook(() => ({ runs: useWorkflowRuns({ page: 1, pageSize: 25, ...query }, { live: true }), retry: useRetryAttempt() }), {
    wrapper,
  });
}

const ids = (result: { current: { runs: { data?: { items: { id: string }[] } } } }) =>
  (result.current.runs.data?.items ?? []).map((r) => r.id);

const settle = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await vi.advanceTimersByTimeAsync(0);
  });

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  tokenStore.set(tokenFor('acme'));
});

afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState');
  tokenStore.clear();
  vi.useRealTimers();
});

describe('backing off', () => {
  it('doubles the interval for each error in a row and stops at a minute', () => {
    expect(backoffDelay(1)).toBe(POLL_INTERVAL_MS * 2);
    expect(backoffDelay(2)).toBe(POLL_INTERVAL_MS * 4);
    expect(backoffDelay(4)).toBe(32_000);
    expect(backoffDelay(5)).toBe(POLL_MAX_BACKOFF_MS);
    expect(backoffDelay(40)).toBe(POLL_MAX_BACKOFF_MS);
  });
});

describe('polling the run list', () => {
  it('merges two polls by id, keeps the rows by createdAt, and sends the first cursor with the second', async () => {
    const A = run('a', '10:00');
    const B = run('b', '09:00');
    const B2 = run('b', '09:00', { status: 'Failed', updatedAt: '2026-10-19T10:10:00Z' });
    const C = run('c', '11:00', { status: 'Pending', updatedAt: '2026-10-19T10:11:00Z' });
    let poll = 0;
    serve(
      () => page([A, B]),
      () => {
        poll += 1;
        if (poll === 1) return page([B2, C], { cursor: 'cursor-1' });
        // The API lags its cursor, so the second poll returns a run the first already did.
        return page([B2], { cursor: 'cursor-2' });
      },
    );

    const { result } = mount();
    await settle();
    expect(ids(result)).toEqual(['a', 'b']);

    await settle(POLL_INTERVAL_MS);
    expect(ids(result)).toEqual(['c', 'a', 'b']);
    expect(result.current.runs.data?.items[2].status).toBe('Failed');
    expect(typeof sentCursor(0)).toBe('string');
    expect(Number.isNaN(Date.parse(sentCursor(0) as string))).toBe(false);

    await settle(POLL_INTERVAL_MS);
    expect(polls()).toHaveLength(2);
    expect(sentCursor(1)).toBe('cursor-1');
    expect(ids(result)).toHaveLength(3);
    expect(new Set(ids(result)).size).toBe(3);

    await settle(POLL_INTERVAL_MS);
    expect(sentCursor(2)).toBe('cursor-2');
  });

  it('takes the status counts of the poll', async () => {
    serve(
      () => page([run('a', '10:00')], { statusCounts: { Succeeded: 1, Failed: 0 } }),
      () => page([], { cursor: 'c', statusCounts: { Succeeded: 1, Failed: 4 } }),
    );

    const { result } = mount();
    await settle(POLL_INTERVAL_MS);

    expect(result.current.runs.data?.statusCounts).toEqual({ Succeeded: 1, Failed: 4 });
  });

  it('does not poll in a hidden tab, and polls at once when the tab is shown again', async () => {
    serve(() => page([run('a', '10:00')]), () => page([], { cursor: 'c' }));
    const { result } = mount();
    await settle();

    setVisibility('hidden');
    await settle(POLL_INTERVAL_MS * 5);
    expect(polls()).toHaveLength(0);
    expect(ids(result)).toEqual(['a']);

    setVisibility('visible');
    await settle();
    expect(polls()).toHaveLength(1);
  });

  it('stays quiet when the page opens in a hidden tab', async () => {
    setVisibility('hidden');
    serve(() => page([run('a', '10:00')]), () => page([], { cursor: 'c' }));
    mount();

    await settle(POLL_INTERVAL_MS * 5);
    expect(lists()).toHaveLength(1);
    expect(polls()).toHaveLength(0);
  });

  it('stops on unmount', async () => {
    serve(() => page([run('a', '10:00')]), () => page([], { cursor: 'c' }));
    const { unmount } = mount();
    await settle(POLL_INTERVAL_MS);
    expect(polls()).toHaveLength(1);

    unmount();
    await settle(POLL_INTERVAL_MS * 5);
    expect(polls()).toHaveLength(1);
  });

  it.each([401, 403])('stops for good on a %i', async (status) => {
    serve(() => page([run('a', '10:00')]), () => failure(status));
    mount();

    await settle(POLL_INTERVAL_MS);
    expect(polls()).toHaveLength(1);

    await settle(POLL_MAX_BACKOFF_MS * 2);
    expect(polls()).toHaveLength(1);
  });

  it('backs off on other errors, and goes back to the interval after an answer', async () => {
    let broken = true;
    serve(
      () => page([run('a', '10:00')]),
      () => (broken ? failure(500) : page([], { cursor: 'c' })),
    );
    mount();

    await settle(POLL_INTERVAL_MS - 1);
    expect(polls()).toHaveLength(0);
    await settle(1);
    expect(polls()).toHaveLength(1);

    // One error in a row waits twice the interval.
    await settle(POLL_INTERVAL_MS * 2 - 1);
    expect(polls()).toHaveLength(1);
    await settle(1);
    expect(polls()).toHaveLength(2);

    // Two in a row wait four times.
    await settle(POLL_INTERVAL_MS * 4 - 1);
    expect(polls()).toHaveLength(2);
    await settle(1);
    expect(polls()).toHaveLength(3);

    broken = false;
    await settle(POLL_INTERVAL_MS * 8);
    expect(polls()).toHaveLength(4);
    await settle(POLL_INTERVAL_MS);
    expect(polls()).toHaveLength(5);
  });

  it('drops the cursor and starts over when the tenant changes', async () => {
    serve(
      () => page([run(tokenStore.token === tokenFor('acme') ? 'acme-run' : 'beta-run', '10:00')]),
      () => page([], { cursor: 'acme-cursor' }),
    );
    const { result } = mount();
    await settle(POLL_INTERVAL_MS * 2);
    expect(ids(result)).toEqual(['acme-run']);
    expect(sentCursor(1)).toBe('acme-cursor');
    const before = polls().length;

    act(() => tokenStore.set(tokenFor('beta')));
    await settle();
    expect(ids(result)).toEqual(['beta-run']);

    await settle(POLL_INTERVAL_MS);
    expect(polls().length).toBe(before + 1);
    expect(sentCursor(before)).not.toBe('acme-cursor');
    expect(Number.isNaN(Date.parse(sentCursor(before) as string))).toBe(false);
  });

  it('does not poll while a retry is in flight, and polls again once it is done', async () => {
    serve(() => page([run('a', '10:00')]), () => page([], { cursor: 'c' }));
    let release!: () => void;
    vi.mocked(api.post).mockImplementation(() => new Promise((resolve) => (release = () => resolve({ data: {} }))));

    const { result } = mount();
    await settle();

    act(() => {
      result.current.retry.mutate({ runId: 'a', ordinal: 1 });
    });
    await settle(POLL_INTERVAL_MS * 5);
    expect(polls()).toHaveLength(0);

    await act(async () => release());
    await settle(POLL_INTERVAL_MS);
    expect(polls().length).toBeGreaterThan(0);
  });

  it('keeps what a poll showed when a refetch that started earlier lands after it', async () => {
    const before = run('a', '10:00');
    const after = run('a', '10:00', { status: 'Failed', updatedAt: '2026-10-19T10:20:00Z' });
    serve(() => page([before]), () => page([after], { cursor: 'c' }));

    const { result } = mount();
    await settle(POLL_INTERVAL_MS);
    expect(result.current.runs.data?.items[0].status).toBe('Failed');
    const reads = lists().length;

    // What a retry's invalidation does. The server's read still holds the older copy.
    act(() => void client.invalidateQueries({ queryKey: ['workflow-runs'] }));
    await settle();

    expect(lists().length).toBeGreaterThan(reads);
    expect(result.current.runs.data?.items[0].status).toBe('Failed');
  });

  it('removes a run that changes status out of a status filter, and polls without the filter', async () => {
    const stays = run('stays', '09:00', { status: 'Failed' });
    const leaves = run('leaves', '10:00', { status: 'Failed' });
    serve(
      () => page([leaves, stays]),
      () => page([run('leaves', '10:00', { status: 'Succeeded', updatedAt: '2026-10-19T10:30:00Z' })], { cursor: 'c' }),
    );

    const { result } = mount({ status: 'Failed' });
    await settle();
    expect(ids(result)).toEqual(['leaves', 'stays']);

    await settle(POLL_INTERVAL_MS);
    expect(ids(result)).toEqual(['stays']);
    expect(polls()[0][1]?.params).not.toHaveProperty('status');
  });

  it('updates the runs on page 2 and adds none to it', async () => {
    const second = run('second', '08:00');
    serve(
      () => page([second], { page: 2, totalItems: 26, totalPages: 2, hasPreviousPage: true }),
      () =>
        page(
          [run('brand-new', '12:00'), run('second', '08:00', { status: 'Failed', updatedAt: '2026-10-19T10:40:00Z' })],
          { cursor: 'c' },
        ),
    );

    const { result } = mount({ page: 2 });
    await settle(POLL_INTERVAL_MS);

    expect(ids(result)).toEqual(['second']);
    expect(result.current.runs.data?.items[0].status).toBe('Failed');
  });

  it('reads the current page again when the API sends no cursor', async () => {
    serve(() => page([run('a', '10:00')]), () => page([run('a', '10:00')]));
    mount();
    await settle();
    expect(lists()).toHaveLength(1);

    await settle(POLL_INTERVAL_MS);
    expect(polls()).toHaveLength(1);
    expect(lists().length).toBeGreaterThan(1);

    const reads = lists().length;
    await settle(POLL_INTERVAL_MS);
    expect(polls()).toHaveLength(1);
    expect(lists().length).toBeGreaterThan(reads);
  });
});

describe('polling an API that sends no cursor', () => {
  /** The first read answers, the poll answers without a cursor, and every read after fails. */
  function brokenAfterFirst(status: number) {
    let reads = 0;
    serve(
      () => {
        reads += 1;
        return reads === 1 ? page([run('a', '10:00')]) : failure(status);
      },
      () => page([run('a', '10:00')]),
    );
  }

  it('backs off when the page read fails with a 500, and says so', async () => {
    brokenAfterFirst(500);
    const { result } = mount();
    await settle();
    expect(lists()).toHaveLength(1);
    expect(result.current.runs.pause).toBeNull();

    // The poll comes back without a cursor, so the page is read again, and that read fails.
    await settle(POLL_INTERVAL_MS);
    expect(lists()).toHaveLength(2);
    expect(result.current.runs.pause).toEqual({ reason: 'backoff' });

    // One error in a row waits twice the interval, two wait four times.
    await settle(POLL_INTERVAL_MS * 2 - 1);
    expect(lists()).toHaveLength(2);
    await settle(1);
    expect(lists()).toHaveLength(3);
    await settle(POLL_INTERVAL_MS * 4 - 1);
    expect(lists()).toHaveLength(3);
    await settle(1);
    expect(lists()).toHaveLength(4);
    expect(ids(result)).toEqual(['a']);
  });

  it.each([401, 403])('stops for good when the page read fails with a %i, and says so', async (status) => {
    brokenAfterFirst(status);
    const { result } = mount();
    await settle(POLL_INTERVAL_MS);
    expect(lists()).toHaveLength(2);

    await settle(POLL_MAX_BACKOFF_MS * 2);
    expect(lists()).toHaveLength(2);
    expect(result.current.runs.pause).toEqual({ reason: 'stopped' });
  });

  it('goes back to the interval and drops the note once a read answers', async () => {
    let broken = false;
    let reads = 0;
    serve(
      () => {
        reads += 1;
        return reads > 1 && broken ? failure(500) : page([run('a', '10:00')]);
      },
      () => page([run('a', '10:00')]),
    );
    const { result } = mount();
    await settle(POLL_INTERVAL_MS);
    broken = true;
    await settle(POLL_INTERVAL_MS);
    expect(result.current.runs.pause).toEqual({ reason: 'backoff' });

    broken = false;
    await settle(POLL_INTERVAL_MS * 2);
    expect(result.current.runs.pause).toBeNull();
  });
});

describe('a status the console does not know', () => {
  it('shows the other runs, keeps the odd one as it is, and keeps polling', async () => {
    const odd = run('odd', '11:00', { status: 'Abandoned' });
    serve(
      () => page([odd, run('a', '10:00')]),
      () => page([run('b', '12:00', { status: 'Failed' })], { cursor: 'c' }),
    );
    const { result } = mount();
    await settle();

    expect(result.current.runs.isError).toBe(false);
    expect(ids(result)).toEqual(['odd', 'a']);
    expect(result.current.runs.data?.items[0].status).toBe('Abandoned');

    await settle(POLL_INTERVAL_MS);
    expect(ids(result)).toEqual(['b', 'odd', 'a']);
    await settle(POLL_INTERVAL_MS);
    expect(polls()).toHaveLength(2);
  });
});

describe('what a fresh read decides', () => {
  it('does not bring back a polled run that the fresh first page no longer holds', async () => {
    const A = run('a', '10:00');
    const GHOST = run('ghost', '11:00', { updatedAt: '2026-10-19T10:50:00Z' });
    serve(() => page([A]), () => page([GHOST], { cursor: 'c' }));
    const { result } = mount();
    await settle(POLL_INTERVAL_MS);
    expect(ids(result)).toEqual(['ghost', 'a']);

    // The server has no such run on page 1 now (removed by the sweep, say).
    act(() => void client.invalidateQueries({ queryKey: ['workflow-runs'] }));
    await settle();

    expect(ids(result)).toEqual(['a']);
  });

  it('keeps the newer counts when a read that began before the poll lands after it', async () => {
    const lateRead: { release?: (body: unknown) => void } = {};
    let reads = 0;
    vi.mocked(api.get).mockImplementation((async (_url: string, config?: { params?: Params }) => {
      const params = config?.params ?? {};
      if ('changedSince' in params) return { data: page([], { cursor: 'c', statusCounts: { Failed: 4, Succeeded: 1 } }) };
      reads += 1;
      if (reads === 1) return { data: page([run('a', '10:00')], { statusCounts: { Failed: 0, Succeeded: 1 } }) };
      return new Promise<{ data: unknown }>((resolve) => {
        lateRead.release = (body) => resolve({ data: body });
      });
    }) as unknown as typeof api.get);

    const { result } = mount();
    await settle();
    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 0, Succeeded: 1 });

    // A read begins, and before it answers a poll brings newer counts.
    act(() => void client.invalidateQueries({ queryKey: ['workflow-runs'] }));
    await settle(POLL_INTERVAL_MS);
    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 4, Succeeded: 1 });

    await act(async () => lateRead.release?.(page([run('a', '10:00')], { statusCounts: { Failed: 0, Succeeded: 1 } })));
    await settle();

    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 4, Succeeded: 1 });
  });

  it('reads the counts of the API whatever case their keys arrive in', async () => {
    serve(() => page([run('a', '10:00')], { statusCounts: { failed: 2, PENDING: 1, Succeeded: 3 } }), () => page([], { cursor: 'c' }));
    const { result } = mount();
    await settle();

    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 2, Pending: 1, Succeeded: 3 });
  });
});
