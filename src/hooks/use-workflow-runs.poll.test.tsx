import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
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
const { useWorkflowRuns, useRetryAttempt, backoffDelay, COUNTS_REFRESH_MS, HOLE_REFETCH_MS, REREAD_MS, POLL_INTERVAL_MS, POLL_MAX_BACKOFF_MS } =
  await import('./use-workflow-runs');

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
/**
 * The one-row reads that fetch only the counts, and the page reads that fetch rows. A counts read is
 * the only list read with a page size of 1, and `mount` refuses a page size of 1, so the split cannot
 * mistake one for the other.
 */
const countReads = () => lists().filter(([, config]) => paramsOf(config).pageSize === 1);
const pageReads = () => lists().filter(([, config]) => paramsOf(config).pageSize !== 1);
const sentCursor = (n: number) => (polls()[n][1]?.params as Params).changedSince;

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mount(query: { page?: number; pageSize?: number; status?: string; workflowId?: string } = {}) {
  if (query.pageSize === 1) throw new Error('a page size of 1 is what a counts read uses');
  return renderHook(() => ({ runs: useWorkflowRuns({ page: 1, pageSize: 25, ...query }, { live: true }), retry: useRetryAttempt() }), {
    wrapper,
  });
}

const ids = (result: { current: { runs: { data?: { items: { id: string }[] } } } }) =>
  (result.current.runs.data?.items ?? []).map((r) => r.id);

// TanStack Query flushes its notifications on setTimeout(0). The fake clock gives a zero delay
// timer set while it is ticking a delay of 1 ms, so a poll's cache write would wait for a tick no
// test makes. On a microtask the write is on screen when the advance that ran the poll returns.
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)));

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

  it('moves the chips and the total when a poll changes the status of a run, though it carries no counts', async () => {
    serve(
      () => page([run('a', '10:00', { status: 'Failed' })], { statusCounts: { Failed: 1, Succeeded: 5 }, totalItems: 1 }),
      () => page([run('a', '10:00', { status: 'Succeeded', updatedAt: '2026-10-19T11:00:00Z' })], { cursor: 'c', statusCounts: null }),
    );

    const { result } = mount({ status: 'Failed' });
    await settle(POLL_INTERVAL_MS);

    expect(polls()).toHaveLength(1);
    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 0, Succeeded: 6 });
    expect(result.current.runs.data?.totalItems).toBe(0);
    expect(ids(result)).toHaveLength(0);
  });

  it('reads the counts again when a poll adds a run, and not again for a repeat of it', async () => {
    const A = run('a', '10:00');
    const N = run('n', '11:00', { status: 'Failed' });
    let polled = 0;
    serve(
      () =>
        polled === 0
          ? page([A], { statusCounts: { Failed: 0, Succeeded: 1 }, totalItems: 1 })
          : page([N, A], { statusCounts: { Failed: 1, Succeeded: 1 }, totalItems: 2 }),
      () => {
        polled += 1;
        return page([N], { cursor: `c${polled}`, statusCounts: null });
      },
    );

    const { result } = mount();
    await settle(POLL_INTERVAL_MS);

    expect(lists()).toHaveLength(2);
    expect(ids(result)).toEqual(['n', 'a']);
    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 1, Succeeded: 1 });
    expect(result.current.runs.data?.totalItems).toBe(2);

    await settle(COUNTS_REFRESH_MS + POLL_INTERVAL_MS);
    expect(polls().length).toBeGreaterThan(2);
    expect(lists()).toHaveLength(2);
    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 1, Succeeded: 1 });
    expect(result.current.runs.data?.totalItems).toBe(2);
  });

  it('keeps counting from the local delta when the list holds no counts', async () => {
    serve(
      () => page([run('a', '10:00')]),
      () => page([run('n', '11:00')], { cursor: 'c', statusCounts: null }),
    );

    const { result } = mount();
    await settle(POLL_INTERVAL_MS);

    expect(result.current.runs.data?.statusCounts).toBeUndefined();
    expect(result.current.runs.data?.totalItems).toBe(2);
  });

  it('resumes from the cursor the last poll sent when live is switched off and on', async () => {
    serve(() => page([run('a', '10:00')]), () => page([], { cursor: 'poll-cursor' }));

    const { rerender } = renderHook(
      ({ live }: { live: boolean }) => useWorkflowRuns({ page: 1, pageSize: 25 }, { live }),
      { wrapper, initialProps: { live: true } },
    );
    await settle(POLL_INTERVAL_MS);
    expect(polls()).toHaveLength(1);

    rerender({ live: false });
    await settle();
    rerender({ live: true });
    await settle(POLL_INTERVAL_MS);

    expect(polls()).toHaveLength(2);
    expect(sentCursor(1)).toBe('poll-cursor');
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

  it('reads the current page again at most every 30 seconds when the API sends no cursor', async () => {
    serve(() => page([run('a', '10:00')]), () => page([run('a', '10:00')]));
    mount();
    await settle();
    expect(lists()).toHaveLength(1);

    await settle(POLL_INTERVAL_MS);
    expect(polls()).toHaveLength(1);
    expect(lists()).toHaveLength(2);

    // The last full read began at 2 s, so the next may begin at 32 s and not before.
    await settle(REREAD_MS - 1);
    expect(polls()).toHaveLength(1);
    expect(lists()).toHaveLength(2);

    await settle(1);
    expect(polls()).toHaveLength(1);
    expect(lists()).toHaveLength(3);
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
    // One failed read is not yet worth a note.
    expect(result.current.runs.pause).toBeNull();

    // One error in a row waits twice the interval, two wait four times.
    await settle(POLL_INTERVAL_MS * 2 - 1);
    expect(lists()).toHaveLength(2);
    await settle(1);
    expect(lists()).toHaveLength(3);
    expect(result.current.runs.pause).toEqual({ reason: 'backoff' });
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
    await settle(REREAD_MS);
    await settle(POLL_INTERVAL_MS * 2);
    expect(result.current.runs.pause).toEqual({ reason: 'backoff' });

    broken = false;
    await settle(POLL_INTERVAL_MS * 4);
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

/**
 * The counts only the server can know. Each server below changes the run before the poll that
 * reports it, and answers list reads with the counts it then holds.
 */
describe('counts a poll cannot place', () => {
  const counts = () => result.current?.runs.data?.statusCounts;
  let result: { current?: { runs: { data?: { statusCounts?: Record<string, number> | null; totalItems: number } } } };

  it('reads the counts again for a new run that fails the filter, and shows the server\'s', async () => {
    const A = run('a', '10:00', { status: 'Failed' });
    let held = { Failed: 1, Pending: 2, Succeeded: 5 };
    let polled = 0;
    serve(
      () => page([A], { statusCounts: held, totalItems: held.Failed }),
      () => {
        polled += 1;
        if (polled > 1) return page([], { cursor: `c${polled}`, statusCounts: null });
        held = { Failed: 1, Pending: 3, Succeeded: 5 };
        return page([run('n', '11:00', { status: 'Pending' })], { cursor: 'c1', statusCounts: null });
      },
    );

    result = mount({ status: 'Failed' }).result;
    await settle(POLL_INTERVAL_MS);

    expect(lists()).toHaveLength(2);
    expect(counts()).toEqual({ Failed: 1, Pending: 3, Succeeded: 5 });
    expect(result.current?.runs.data?.totalItems).toBe(1);
  });

  it('never moves a count for a run first seen off the page when it changes again, and converges', async () => {
    const A = run('a', '10:00', { status: 'Failed' });
    let held: Record<string, number> = { Failed: 1, Pending: 2, Succeeded: 5 };
    let polled = 0;
    serve(
      () => page([A], { statusCounts: held, totalItems: held.Failed }),
      () => {
        polled += 1;
        if (polled === 1) {
          held = { Failed: 1, Pending: 3, Succeeded: 5 };
          return page([run('n', '11:00', { status: 'Pending' })], { cursor: 'c1', statusCounts: null });
        }
        if (polled === 2) {
          held = { Failed: 1, Pending: 2, Running: 1, Succeeded: 5 };
          return page([run('n', '11:00', { status: 'Running', updatedAt: '2026-10-19T11:05:00Z' })], { cursor: 'c2', statusCounts: null });
        }
        return page([], { cursor: `c${polled}`, statusCounts: null });
      },
    );

    result = mount({ status: 'Failed' }).result;
    await settle(POLL_INTERVAL_MS);
    expect(counts()).toEqual({ Failed: 1, Pending: 3, Succeeded: 5 });

    // The second change lands inside the refresh interval: the chips wait, unmoved.
    await settle(POLL_INTERVAL_MS);
    expect(polls()).toHaveLength(2);
    expect(lists()).toHaveLength(2);
    expect(counts()).toEqual({ Failed: 1, Pending: 3, Succeeded: 5 });

    await settle(COUNTS_REFRESH_MS);
    expect(lists()).toHaveLength(3);
    expect(counts()).toEqual({ Failed: 1, Pending: 2, Running: 1, Succeeded: 5 });
  });

  it('does not move an off-page run again when a poll reports a change a refetch already counted', async () => {
    const A = run('a', '10:00', { status: 'Failed' });
    let held: Record<string, number> = { Failed: 1, Running: 2, Succeeded: 5 };
    let polled = 0;
    serve(
      () => page([A], { statusCounts: held, totalItems: held.Failed }),
      () => {
        polled += 1;
        if (polled === 1) {
          held = { Failed: 1, Running: 3, Succeeded: 5 };
          return page([run('z', '09:00', { status: 'Running' })], { cursor: 'c1', statusCounts: null });
        }
        // The lagging cursor reports the change the refetch below already read.
        return page([run('z', '09:00', { status: 'Succeeded', updatedAt: '2026-10-19T09:20:00Z' })], {
          cursor: `c${polled}`,
          statusCounts: null,
        });
      },
    );

    result = mount({ status: 'Failed' }).result;
    await settle(POLL_INTERVAL_MS);
    expect(counts()).toEqual({ Failed: 1, Running: 3, Succeeded: 5 });

    held = { Failed: 1, Running: 2, Succeeded: 6 };
    act(() => void client.invalidateQueries({ queryKey: ['workflow-runs'] }));
    await settle();
    expect(counts()).toEqual({ Failed: 1, Running: 2, Succeeded: 6 });

    await settle(POLL_INTERVAL_MS);
    expect(polls()).toHaveLength(2);
    expect(counts()).toEqual({ Failed: 1, Running: 2, Succeeded: 6 });

    await settle(COUNTS_REFRESH_MS);
    expect(counts()).toEqual({ Failed: 1, Running: 2, Succeeded: 6 });
  });

  it('reads the counts again when a read that began before a poll of an off-page run lands after it', async () => {
    const A = run('a', '10:00', { status: 'Failed' });
    const before = { Failed: 1, Running: 2, Succeeded: 5 };
    const after = { Failed: 1, Running: 1, Succeeded: 6 };
    const lateRead: { release?: () => void } = {};
    let polled = 0;
    let reads = 0;
    vi.mocked(api.get).mockImplementation((async (_url: string, config?: { params?: Params }) => {
      const params = config?.params ?? {};
      if ('changedSince' in params) {
        polled += 1;
        if (polled > 1) return { data: page([], { cursor: `c${polled}`, statusCounts: null }) };
        const changed = run('z', '09:00', { status: 'Succeeded', updatedAt: '2026-10-19T09:20:00Z' });
        return { data: page([changed], { cursor: 'c1', statusCounts: null }) };
      }
      reads += 1;
      if (reads === 1) return { data: page([A], { statusCounts: before, totalItems: 1 }) };
      if (reads === 2) {
        return new Promise<{ data: unknown }>((resolve) => {
          lateRead.release = () => resolve({ data: page([A], { statusCounts: before, totalItems: 1 }) });
        });
      }
      return { data: page([A], { statusCounts: after, totalItems: 1 }) };
    }) as unknown as typeof api.get);

    result = mount({ status: 'Failed' }).result;
    await settle();

    // A read begins, and before it answers a poll finds an off-page run changed.
    act(() => void client.invalidateQueries({ queryKey: ['workflow-runs'] }));
    await settle(POLL_INTERVAL_MS);
    expect(polls()).toHaveLength(1);
    expect(reads).toBe(2);

    await act(async () => lateRead.release?.());
    await settle();
    expect(counts()).toEqual(before);

    await settle(POLL_INTERVAL_MS);
    expect(reads).toBe(3);
    expect(counts()).toEqual(after);
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

  it('keeps the counts a poll moved when a read that began before the poll lands after it', async () => {
    const lateRead: { release?: (body: unknown) => void } = {};
    let reads = 0;
    const stale = () => page([run('a', '10:00')], { statusCounts: { Failed: 0, Succeeded: 1 } });
    vi.mocked(api.get).mockImplementation((async (_url: string, config?: { params?: Params }) => {
      const params = config?.params ?? {};
      if ('changedSince' in params) {
        const changed = run('a', '10:00', { status: 'Failed', updatedAt: '2026-10-19T11:00:00Z' });
        return { data: page([changed], { cursor: 'c', statusCounts: null }) };
      }
      reads += 1;
      if (reads === 1) return { data: stale() };
      return new Promise<{ data: unknown }>((resolve) => {
        lateRead.release = (body) => resolve({ data: body });
      });
    }) as unknown as typeof api.get);

    const { result } = mount();
    await settle();
    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 0, Succeeded: 1 });

    // A read begins, and before it answers a poll finds the run failed.
    act(() => void client.invalidateQueries({ queryKey: ['workflow-runs'] }));
    await settle(POLL_INTERVAL_MS);
    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 1, Succeeded: 0 });

    await act(async () => lateRead.release?.(stale()));
    await settle();

    expect(result.current.runs.data?.items).toHaveLength(1);
    expect(result.current.runs.data?.items[0].status).toBe('Failed');
    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 1, Succeeded: 0 });
  });

  it('reads the counts of the API whatever case their keys arrive in', async () => {
    serve(() => page([run('a', '10:00')], { statusCounts: { failed: 2, PENDING: 1, Succeeded: 3 } }), () => page([], { cursor: 'c' }));
    const { result } = mount();
    await settle();

    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 2, Pending: 1, Succeeded: 3 });
  });
});

describe('what the counts refresh costs', () => {
  it('reads only the counts, a few times in three minutes, while an off-page run changes on every poll', async () => {
    const A = run('a', '10:00', { status: 'Failed' });
    let polled = 0;
    serve(
      () => page([A], { statusCounts: { Failed: 1, Running: 2 }, totalItems: 1 }),
      () => {
        polled += 1;
        const changed = run('z', '09:00', { status: 'Running', updatedAt: new Date(Date.now()).toISOString() });
        return page([changed], { cursor: `c${polled}`, statusCounts: null });
      },
    );

    mount({ status: 'Failed' });
    await settle(180_000);

    expect(polls()).toHaveLength(90);
    expect(pageReads()).toHaveLength(1);
    const reads = countReads();
    expect(reads).toHaveLength(3);
    for (const [, config] of reads) {
      expect(config?.params).toEqual({ page: 1, pageSize: 1 });
    }
    expect(COUNTS_REFRESH_MS).toBe(60_000);
  });

  it('puts a counts read on the chips and the total and leaves the rows alone', async () => {
    const rows = [run('a', '10:00', { status: 'Failed' }), run('b', '09:00', { status: 'Failed' })];
    let polled = 0;
    serve(
      (params) =>
        params.pageSize === 1
          ? page([run('other', '08:00', { status: 'Failed' })], {
              totalItems: 99,
              statusCounts: { Failed: 60, Running: 1 },
            })
          : page(rows, { statusCounts: { Failed: 2, Running: 1 }, totalItems: 2 }),
      () => {
        polled += 1;
        return page([run('z', '07:00', { status: 'Running' })], { cursor: `c${polled}`, statusCounts: null });
      },
    );

    const { result } = mount({ status: 'Failed' });
    await settle();
    expect(ids(result)).toHaveLength(2);

    await settle(POLL_INTERVAL_MS);

    expect(countReads()).toHaveLength(1);
    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 60, Running: 1 });
    expect(result.current.runs.data?.totalItems).toBe(60);
    expect(result.current.runs.data?.totalPages).toBe(3);
    expect(result.current.runs.data?.hasNextPage).toBe(true);
    expect(ids(result)).toHaveLength(2);
    expect(ids(result)).toEqual(['a', 'b']);
    expect(result.current.runs.data?.items).toEqual(rows);
  });

  it('says the counts are catching up while they are dirty, and stops saying it once a read lands', async () => {
    const late: { release?: () => void } = {};
    const body = () => page([run('a', '10:00', { status: 'Failed' })], { statusCounts: { Failed: 1, Running: 3 }, totalItems: 1 });
    vi.mocked(api.get).mockImplementation((async (_url: string, config?: { params?: Params }) => {
      const params = config?.params ?? {};
      if ('changedSince' in params) {
        return { data: page([run('z', '09:00', { status: 'Running' })], { cursor: 'c1', statusCounts: null }) };
      }
      if (params.pageSize !== 1) return { data: page([run('a', '10:00', { status: 'Failed' })], { statusCounts: { Failed: 1, Running: 2 }, totalItems: 1 }) };
      return new Promise<{ data: unknown }>((resolve) => {
        late.release = () => resolve({ data: body() });
      });
    }) as unknown as typeof api.get);

    const { result } = mount({ status: 'Failed' });
    await settle();
    expect(result.current.runs.countsBehind).toBe(false);

    await settle(POLL_INTERVAL_MS);
    expect(countReads()).toHaveLength(1);
    expect(result.current.runs.countsBehind).toBe(true);

    await act(async () => late.release?.());
    await settle();
    expect(result.current.runs.countsBehind).toBe(false);
    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 1, Running: 3 });
  });

  it('does not start a counts read while another is still in flight', async () => {
    const late: { release?: () => void } = {};
    let polled = 0;
    vi.mocked(api.get).mockImplementation((async (_url: string, config?: { params?: Params }) => {
      const params = config?.params ?? {};
      if ('changedSince' in params) {
        polled += 1;
        const changed = run('z', '09:00', { status: 'Running', updatedAt: new Date(Date.now()).toISOString() });
        return { data: page([changed], { cursor: `c${polled}`, statusCounts: null }) };
      }
      const body = page([run('a', '10:00', { status: 'Failed' })], { statusCounts: { Failed: 1, Running: 2 }, totalItems: 1 });
      if (params.pageSize !== 1 || countReads().length === 1) return { data: body };
      return new Promise<{ data: unknown }>((resolve) => {
        late.release = () => resolve({ data: body });
      });
    }) as unknown as typeof api.get);

    mount({ status: 'Failed' });
    await settle(POLL_INTERVAL_MS);
    expect(countReads()).toHaveLength(1);

    // Past the interval, the first read is done, so the second goes out and then hangs.
    await settle(COUNTS_REFRESH_MS);
    expect(countReads()).toHaveLength(2);

    await settle(COUNTS_REFRESH_MS * 2);
    expect(countReads()).toHaveLength(2);

    await act(async () => late.release?.());
    await settle(POLL_INTERVAL_MS);
    expect(countReads()).toHaveLength(3);
  });
});

describe('the counts hint and the throttle across mounts', () => {
  const offPage = () => run('z', '09:00', { status: 'Running', updatedAt: new Date(Date.now()).toISOString() });

  it('does not read the counts again when the list is unmounted and mounted within a minute', async () => {
    serve(
      () => page([run('a', '10:00', { status: 'Failed' })], { statusCounts: { Failed: 1, Running: 2 }, totalItems: 1 }),
      () => page([offPage()], { cursor: 'c', statusCounts: null }),
    );

    const first = mount({ status: 'Failed' });
    await settle(POLL_INTERVAL_MS);
    expect(countReads()).toHaveLength(1);
    first.unmount();

    mount({ status: 'Failed' });
    await settle(30_000);

    expect(polls().length).toBeGreaterThan(2);
    expect(countReads()).toHaveLength(1);
  });

  it('forgets the dirty flag when polling stops, so it is not back when polling resumes', async () => {
    const late: { release?: () => void } = {};
    let polled = 0;
    vi.mocked(api.get).mockImplementation((async (_url: string, config?: { params?: Params }) => {
      const params = config?.params ?? {};
      if ('changedSince' in params) {
        polled += 1;
        if (polled === 2) throw failure(403);
        const items = polled === 1 ? [offPage()] : [];
        return { data: page(items, { cursor: `c${polled}`, statusCounts: null }) };
      }
      const body = page([run('a', '10:00', { status: 'Failed' })], { statusCounts: { Failed: 1, Running: 2 }, totalItems: 1 });
      if (params.pageSize !== 1) return { data: body };
      return new Promise<{ data: unknown }>((resolve) => {
        late.release = () => resolve({ data: body });
      });
    }) as unknown as typeof api.get);

    const { result, rerender } = renderHook(
      ({ live }) => useWorkflowRuns({ page: 1, pageSize: 25, status: 'Failed' }, { live }),
      { wrapper, initialProps: { live: true } },
    );
    await settle(POLL_INTERVAL_MS);
    expect(countReads()).toHaveLength(1);
    expect(result.current.countsBehind).toBe(true);

    await settle(POLL_INTERVAL_MS);
    expect(result.current.pause).toEqual({ reason: 'stopped' });
    expect(result.current.countsBehind).toBe(false);

    // The API answers again and polling restarts. The counts read that was in flight when it
    // stopped never landed, so a flag that survived the stop would show here.
    rerender({ live: false });
    rerender({ live: true });
    await settle(POLL_INTERVAL_MS);
    expect(result.current.pause).toBeNull();
    expect(result.current.countsBehind).toBe(false);
  });

  it('keeps the dirty flag when the polling effect reruns without a stop', async () => {
    serve(
      () => page([run('a', '10:00', { status: 'Failed' })], { statusCounts: { Failed: 1, Running: 2 }, totalItems: 1 }),
      () => page([offPage()], { cursor: 'c', statusCounts: null }),
    );
    let broken = true;
    const base = vi.mocked(api.get).getMockImplementation() as (...args: unknown[]) => Promise<unknown>;
    vi.mocked(api.get).mockImplementation(((...args: unknown[]) => {
      const params = ((args[1] as { params?: Params } | undefined)?.params ?? {}) as Params;
      if (broken && params.pageSize === 1) return Promise.reject(failure(500));
      return base(...args);
    }) as unknown as typeof api.get);

    const { result, rerender } = renderHook(
      ({ live }) => useWorkflowRuns({ page: 1, pageSize: 25, status: 'Failed' }, { live }),
      { wrapper, initialProps: { live: true } },
    );
    await settle(POLL_INTERVAL_MS);
    expect(countReads()).toHaveLength(1);
    expect(result.current.countsBehind).toBe(true);

    rerender({ live: false });
    rerender({ live: true });
    broken = false;
    expect(result.current.countsBehind).toBe(true);

    await settle(HOLE_REFETCH_MS);
    expect(countReads()).toHaveLength(2);
    expect(result.current.countsBehind).toBe(false);
  });

  it('waits longer after each failed counts read, up to a minute', async () => {
    serve(
      (params) => {
        if (params.pageSize !== 1) return page([run('a', '10:00', { status: 'Failed' })], { statusCounts: { Failed: 1, Running: 2 }, totalItems: 1 });
        return failure(500);
      },
      () => page([offPage()], { cursor: 'c', statusCounts: null }),
    );

    mount({ status: 'Failed' });
    // Reads begin at 2 s, then 10 s, 20 s and 40 s later, then a minute apart.
    await settle(POLL_INTERVAL_MS);
    expect(countReads()).toHaveLength(1);
    await settle(HOLE_REFETCH_MS);
    expect(countReads()).toHaveLength(2);
    await settle(HOLE_REFETCH_MS * 2);
    expect(countReads()).toHaveLength(3);
    await settle(HOLE_REFETCH_MS * 4);
    expect(countReads()).toHaveLength(4);
    await settle(COUNTS_REFRESH_MS - POLL_INTERVAL_MS);
    expect(countReads()).toHaveLength(4);
    await settle(POLL_INTERVAL_MS);
    expect(countReads()).toHaveLength(5);
  });

  it('tries a failed counts read again after ten seconds, not a minute, and clears the hint when it lands', async () => {
    let counted = 0;
    serve(
      (params) => {
        if (params.pageSize !== 1) return page([run('a', '10:00', { status: 'Failed' })], { statusCounts: { Failed: 1, Running: 2 }, totalItems: 1 });
        counted += 1;
        return counted === 1 ? failure(500) : page([], { statusCounts: { Failed: 1, Running: 3 } });
      },
      () => page([offPage()], { cursor: 'c', statusCounts: null }),
    );

    const { result } = mount({ status: 'Failed' });
    await settle(POLL_INTERVAL_MS);
    expect(countReads()).toHaveLength(1);
    expect(result.current.runs.countsBehind).toBe(true);

    await settle(HOLE_REFETCH_MS - POLL_INTERVAL_MS);
    expect(countReads()).toHaveLength(1);

    await settle(POLL_INTERVAL_MS);
    expect(countReads()).toHaveLength(2);
    expect(result.current.runs.countsBehind).toBe(false);
    expect(result.current.runs.data?.statusCounts).toEqual({ Failed: 1, Running: 3 });
  });

  it('sends the workflow to the poll and to the counts read', async () => {
    serve(
      () => page([run('a', '10:00', { status: 'Failed' })], { statusCounts: { Failed: 1, Running: 2 }, totalItems: 1 }),
      () => page([offPage()], { cursor: 'c', statusCounts: null }),
    );

    mount({ status: 'Failed', workflowId: 'w1' });
    await settle(POLL_INTERVAL_MS);

    expect(polls()).toHaveLength(1);
    expect(polls()[0][1]?.params).toMatchObject({ workflowId: 'w1' });
    expect(countReads()).toHaveLength(1);
    expect(countReads()[0][1]?.params).toEqual({ page: 1, pageSize: 1, workflowId: 'w1' });
  });
});

describe('a run that leaves the filter with more runs behind the page', () => {
  const rows = Array.from({ length: 40 }, (_, i) => run(`x${i + 1}`, `10:${String(59 - i).padStart(2, '0')}`, { status: 'Failed' }));

  function leaving(polled: number) {
    const changed = { ...rows[polled - 1], status: 'Succeeded', updatedAt: `2026-10-19T11:${String(polled).padStart(2, '0')}:00Z` };
    return page([changed], { cursor: `c${polled}` });
  }

  it('is read again at most once per ten seconds', async () => {
    let polled = 0;
    serve(
      () => page(rows, { pageSize: 40, totalItems: 80, totalPages: 2, hasNextPage: true }),
      () => leaving((polled += 1)),
    );

    mount({ status: 'Failed', pageSize: 40 });
    await settle(60_000);

    expect(polls()).toHaveLength(30);
    // The first read, then a hole at 2 s, 12 s, 22 s, 32 s, 42 s and 52 s. Unthrottled it was 31.
    expect(pageReads()).toHaveLength(7);
    expect(HOLE_REFETCH_MS).toBe(10_000);
  });

  it('goes out as one read, not a page read and a counts read, when a poll has a hole and an off-page change', async () => {
    let polled = 0;
    serve(
      () => page(rows, { pageSize: 40, totalItems: 80, totalPages: 2, hasNextPage: true, statusCounts: { Failed: 80, Running: 2 } }),
      () => {
        polled += 1;
        if (polled > 1) return page([], { cursor: `c${polled}`, statusCounts: null });
        const off = run('z', '09:00', { status: 'Running', updatedAt: new Date(Date.now()).toISOString() });
        return page([leaving(1).items[0], off], { cursor: 'c1' });
      },
    );

    mount({ status: 'Failed', pageSize: 40 });
    await settle(POLL_INTERVAL_MS);

    expect(polls()).toHaveLength(1);
    expect(pageReads()).toHaveLength(2);
    expect(countReads()).toHaveLength(0);

    await settle(COUNTS_REFRESH_MS);
    expect(pageReads()).toHaveLength(2);
    expect(countReads()).toHaveLength(0);
  });

  it('does not cancel a read of the list that is already in flight', async () => {
    const slow: { release?: () => void } = {};
    let polled = 0;
    let reads = 0;
    vi.mocked(api.get).mockImplementation((async (_url: string, config?: { params?: Params }) => {
      const params = config?.params ?? {};
      if ('changedSince' in params) return { data: leaving((polled += 1)) };
      reads += 1;
      const body = page(rows, { pageSize: 40, totalItems: 80, totalPages: 2, hasNextPage: true });
      if (reads !== 2) return { data: body };
      return new Promise<{ data: unknown }>((resolve) => {
        slow.release = () => resolve({ data: body });
      });
    }) as unknown as typeof api.get);

    mount({ status: 'Failed', pageSize: 40 });
    await settle(POLL_INTERVAL_MS);
    expect(pageReads()).toHaveLength(2);

    // Many polls with a hole each, while the second read is still open.
    await settle(30_000);
    expect(polls().length).toBeGreaterThan(10);
    expect(pageReads()).toHaveLength(2);

    await act(async () => slow.release?.());
    await settle(POLL_INTERVAL_MS);
    expect(pageReads()).toHaveLength(3);
  });
});
