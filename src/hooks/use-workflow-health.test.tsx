import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const { api, tokenStore } = await import('@/lib/api');
const { AxiosError, AxiosHeaders } = await import('axios');
const { healthTile, runNowMessage, useWorkflowHealth, useRunWorkflow } = await import('./use-workflow-health');
const { runListParams } = await import('./use-workflow-runs');

function tokenFor(tenant: string): string {
  return `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ sub: 'u1', tenant }))}.sig`;
}

function refusal(status: number, data: unknown = {}) {
  return new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

function row(workflowId: string, extra: Record<string, unknown> = {}) {
  return {
    workflowId,
    name: workflowId,
    enabled: true,
    lastOutcomes: [],
    successRate: 0.5,
    finishedRuns: 4,
    averageActionDurationMs: null,
    ...extra,
  };
}

function envelope(items: unknown[]) {
  return {
    items,
    page: 1,
    pageSize: 100,
    totalItems: items.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    windowDays: 7,
    windowFrom: '2026-10-13T00:00:00Z',
  };
}

function Probe() {
  const health = useWorkflowHealth();
  return (
    <p>
      {health.unavailable ? 'unavailable' : health.isError ? 'failed' : (health.healthOf('w1')?.name ?? 'nothing yet')}
    </p>
  );
}

function renderWith(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return client;
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  tokenStore.set(tokenFor('acme'));
});

afterEach(() => {
  tokenStore.clear();
});

describe('healthTile', () => {
  it('says nothing for no answer', () => {
    expect(healthTile(undefined)).toEqual({ kind: 'none' });
  });

  it('says no runs yet for a null rate, not 0 or 100', () => {
    expect(healthTile({ successRate: null, finishedRuns: 0 })).toEqual({ kind: 'no-runs' });
    expect(healthTile({ successRate: undefined, finishedRuns: 0 })).toEqual({ kind: 'no-runs' });
  });

  it('gives a rate with the sample it was taken over', () => {
    expect(healthTile({ successRate: 1, finishedRuns: 3 })).toEqual({ kind: 'rate', percent: 100, succeeded: 3, finished: 3 });
    expect(healthTile({ successRate: 2 / 3, finishedRuns: 3 })).toEqual({ kind: 'rate', percent: 67, succeeded: 2, finished: 3 });
    expect(healthTile({ successRate: 0, finishedRuns: 2 })).toEqual({ kind: 'rate', percent: 0, succeeded: 0, finished: 2 });
  });
});

describe('useWorkflowHealth', () => {
  it('reads the health of a workflow by id', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: envelope([row('w1')]) });
    renderWith(<Probe />);

    expect(await screen.findByText('w1')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/workflows/health', { params: { page: 1, pageSize: 100 } });
  });

  it('is unavailable on a 404 and failed on anything else', async () => {
    vi.mocked(api.get).mockRejectedValue(refusal(404));
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <Probe />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('unavailable')).toBeInTheDocument();
    unmount();

    vi.mocked(api.get).mockRejectedValue(refusal(500));
    renderWith(<Probe />);
    expect(await screen.findByText('failed')).toBeInTheDocument();
  });

  it('shows none of the first tenant rows once the token changes', async () => {
    let calls = 0;
    let release!: (value: { data: unknown }) => void;
    const held = new Promise<{ data: unknown }>((resolve) => {
      release = resolve;
    });
    vi.mocked(api.get).mockImplementation((async () => {
      calls += 1;
      return calls === 1 ? { data: envelope([row('w1', { name: 'acme workflow' })]) } : held;
    }) as typeof api.get);

    renderWith(<Probe />);
    expect(await screen.findByText('acme workflow')).toBeInTheDocument();

    act(() => tokenStore.set(tokenFor('globex')));

    await waitFor(() => expect(screen.queryByText('acme workflow')).toBeNull());
    expect(screen.getByText('nothing yet')).toBeInTheDocument();
    release({ data: envelope([row('w1', { name: 'globex workflow' })]) });
    expect(await screen.findByText('globex workflow')).toBeInTheDocument();
  });
});

describe('useRunWorkflow', () => {
  function Runner({ onDone }: { onDone: () => void }) {
    const run = useRunWorkflow();
    return (
      <button onClick={() => run.mutate({ workflowId: 'w 1', entryId: 'e1', idempotencyKey: 'k1' }, { onSettled: () => onDone() })}>
        go
      </button>
    );
  }

  it('posts the entry to the encoded route with the key as the Idempotency-Key header', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { runId: 'r1' } });
    const done = vi.fn();
    renderWith(<Runner onDone={done} />);

    screen.getByText('go').click();

    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/api/workflows/w%201/run', { entryId: 'e1' }, { headers: { 'Idempotency-Key': 'k1' } });
  });
});

describe('runNowMessage', () => {
  it('names each refusal', () => {
    expect(runNowMessage(refusal(403))).toBe('You do not have permission to run workflows.');
    expect(runNowMessage(refusal(404))).toContain('no longer exists');
    expect(runNowMessage(refusal(400, { message: 'wrong type' }))).toBe('wrong type');
    expect(runNowMessage(refusal(409, { message: 'switched off' }))).toBe('switched off');
    expect(runNowMessage(refusal(400))).toContain('not of a type');
    expect(runNowMessage(refusal(409))).toContain('switched off');
  });
});

describe('runListParams', () => {
  it('sends the workflow filter only when it is set', () => {
    expect(runListParams({ workflowId: 'w1' })).toMatchObject({ workflowId: 'w1' });
    expect(runListParams({ workflowId: ' ' })).not.toHaveProperty('workflowId');
    expect(runListParams({})).not.toHaveProperty('workflowId');
  });
});

describe('useWorkflowHealth paging', () => {
  it('reads every page, so no tile is dropped past the first', async () => {
    vi.mocked(api.get).mockImplementation((async (_url: string, config: { params: { page: number } }) => {
      const first = config.params.page === 1;
      return {
        data: {
          ...envelope([row(first ? 'w0' : 'w1', { name: first ? 'first' : 'second page' })]),
          page: config.params.page,
          hasNextPage: first,
        },
      };
    }) as typeof api.get);
    renderWith(<Probe />);

    expect(await screen.findByText('second page')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
