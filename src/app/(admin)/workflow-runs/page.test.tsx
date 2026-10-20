import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Who the caller is, so a test can hand the screen a caller who holds some capabilities and not
// others. The default holds everything, which is what the older tests in this file were written for.
const { accessFrom } = await vi.importActual<typeof import('@/lib/access')>('@/lib/access');
type AccessResult = ReturnType<typeof accessFrom>;
let access: AccessResult = accessFrom({ userId: 'u', username: 'u', tenant: 't', roles: [], capabilities: ['*'] }, []);
vi.mock('@/hooks/use-access', () => ({ useAccess: () => access }));

// Radix sizes its dialog with one, and jsdom ships no implementation.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { api } = await import('@/lib/api');
const { toast } = await import('sonner');
const { AxiosError, AxiosHeaders } = await import('axios');
const { default: WorkflowRunsPage } = await import('./page');

const EVERYTHING = accessFrom({ userId: 'u', username: 'u', tenant: 't', roles: [], capabilities: ['*'] }, []);

beforeEach(() => {
  access = EVERYTHING;
  searchParams = new URLSearchParams();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
});

const QUESTION = 'This failure will not fix itself by retrying. Retry anyway?';

function action(ordinal: number, status: string, extra: Record<string, unknown> = {}) {
  return {
    ordinal,
    actionType: 'Webhook',
    status,
    attempts: 1,
    nextAttemptAt: null,
    responseStatus: null,
    error: status === 'Failed' ? `Failure ${ordinal}` : null,
    completedAt: null,
    durationMs: 100,
    ...extra,
  };
}

function run(id: string, workflowName: string, status: string, actions: unknown[]) {
  return {
    id,
    workflowDefinitionId: 'wf-1',
    workflowName,
    contentId: '11111111-1111-1111-1111-111111111111',
    contentType: 'article',
    triggerEvent: 'ContentPublished',
    status,
    createdAt: '2026-09-03T10:00:00Z',
    completedAt: '2026-09-03T10:00:05Z',
    actions,
  };
}

// The earlier action failed in a way a retry can fix and the later one did not, so a screen that
// asked for the whole run, or that read the first failure for every button, shows up here.
const MIXED = run('run-mixed', 'Announce a post', 'Failed', [
  action(1, 'Failed', { retryable: true }),
  action(2, 'Failed', { retryable: false }),
  // What an API older than 4.2.0 sends: no retryable at all.
  action(3, 'Failed'),
]);

const TEMPORARY_ONLY = run('run-temp', 'Push to the CDN', 'Failed', [
  action(1, 'Succeeded'),
  action(2, 'Failed', { retryable: true }),
]);

const OLDER_API = run('run-old', 'Tidy the index', 'Failed', [action(1, 'Failed'), action(2, 'Failed', { retryable: null })]);

const RUNS = [MIXED, TEMPORARY_ONLY, OLDER_API];

function retryCalls() {
  return vi.mocked(api.post).mock.calls.filter(([url]) => String(url).endsWith('/retry'));
}

function renderPage() {
  vi.mocked(api.get).mockImplementation((async (url: string) => {
    if (url === '/api/workflow-runs') {
      return {
        data: {
          items: RUNS,
          page: 1,
          pageSize: 25,
          totalItems: RUNS.length,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
    }
    return { data: RUNS.find((r) => url.endsWith(`/${r.id}`)) };
  }) as typeof api.get);
  vi.mocked(api.post).mockResolvedValue({ data: MIXED });

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WorkflowRunsPage />
    </QueryClientProvider>,
  );
}

async function openMixedRun() {
  renderPage();
  fireEvent.click(await screen.findByRole('radio', { name: /Announce a post/ }));
  const list = await screen.findByRole('list', { name: 'Actions' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  return list;
}

describe('the workflow runs screen and the kind of a failure', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('labels each failed action from its own retryable, and leaves the one without it bare', async () => {
    const list = await openMixedRun();
    const [first, second, third] = within(list).getAllByRole('listitem');

    expect(within(first).getByText('Temporary')).toBeInTheDocument();
    expect(within(first).queryByText('Permanent')).not.toBeInTheDocument();

    expect(within(second).getByText('Permanent')).toBeInTheDocument();
    expect(within(second).queryByText('Temporary')).not.toBeInTheDocument();

    expect(within(third).queryByText('Temporary')).not.toBeInTheDocument();
    expect(within(third).queryByText('Permanent')).not.toBeInTheDocument();
  });

  it('sends no request when the question on a permanent failure is cancelled', async () => {
    await openMixedRun();

    fireEvent.click(screen.getByRole('button', { name: /Retry action 2/ }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(QUESTION);
    expect(retryCalls()).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(retryCalls()).toHaveLength(0);
  });

  it('sends the one retry request it always sent once the question is confirmed', async () => {
    await openMixedRun();

    fireEvent.click(screen.getByRole('button', { name: /Retry action 2/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry anyway' }));

    await waitFor(() => expect(retryCalls()).toHaveLength(1));
    // The same path and the same empty body as a retry without the question. The API works out
    // wasPermanent for its audit entry from the stored attempt, so nothing extra is sent.
    expect(retryCalls()[0]).toEqual(['/api/workflow-runs/run-mixed/actions/2/retry', {}]);
  });

  it('retries a temporary failure straight away, though a later action in the run is permanent', async () => {
    await openMixedRun();

    fireEvent.click(screen.getByRole('button', { name: /Retry action 1/ }));

    await waitFor(() => expect(retryCalls()).toHaveLength(1));
    expect(retryCalls()[0]).toEqual(['/api/workflow-runs/run-mixed/actions/1/retry', {}]);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('retries a failure with no retryable straight away, as it did before the field existed', async () => {
    await openMixedRun();

    fireEvent.click(screen.getByRole('button', { name: /Retry action 3/ }));

    await waitFor(() => expect(retryCalls()).toHaveLength(1));
    expect(retryCalls()[0]).toEqual(['/api/workflow-runs/run-mixed/actions/3/retry', {}]);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('marks a run in the list by its worst failure, and leaves an older API run unmarked', async () => {
    renderPage();
    await screen.findByRole('radio', { name: /Announce a post/ });

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);

    expect(within(rows[0]).getByText('Permanent')).toBeInTheDocument();
    expect(within(rows[0]).queryByText('Temporary')).not.toBeInTheDocument();

    expect(within(rows[1]).getByText('Temporary')).toBeInTheDocument();
    expect(within(rows[1]).queryByText('Permanent')).not.toBeInTheDocument();

    expect(within(rows[2]).getByText('Failed')).toBeInTheDocument();
    expect(within(rows[2]).queryByText('Temporary')).not.toBeInTheDocument();
    expect(within(rows[2]).queryByText('Permanent')).not.toBeInTheDocument();
  });
});

describe('cancelling a run', () => {
  const WAITING = { ...run('run-wait', 'Send the invoice', 'Pending', [action(1, 'Pending')]), cancelledAt: null };
  const WAITING_OLD_API = run('run-wait-old', 'Old waiting run', 'Pending', [action(1, 'Pending')]);
  const STOPPED = {
    ...run('run-stopped', 'Stopped run', 'Cancelled', [action(1, 'Failed', { retryable: true }), action(2, 'Cancelled')]),
    cancelledAt: '2026-09-03T10:00:03Z',
  };
  const ALL = [WAITING, WAITING_OLD_API, STOPPED];

  function renderRuns() {
    vi.mocked(api.get).mockImplementation((async (url: string) => {
      if (url === '/api/workflow-runs') {
        return {
          data: { items: ALL, page: 1, pageSize: 25, totalItems: ALL.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
        };
      }
      return { data: ALL.find((r) => url.endsWith(`/${r.id}`)) };
    }) as typeof api.get);
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <WorkflowRunsPage />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('cancels a waiting run only after confirming', async () => {
    renderRuns();
    fireEvent.click(await screen.findByRole('radio', { name: /Send the invoice/ }));

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel run' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, cancel the run' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/workflow-runs/run-wait/cancel', {}));
  });

  it('keeps the confirmation open when a refresh shows the run has since been cancelled, and does not send the request', async () => {
    renderRuns();
    fireEvent.click(await screen.findByRole('radio', { name: /Send the invoice/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel run' }));
    const dialog = await screen.findByRole('alertdialog');

    const cancelledMeanwhile = { ...WAITING, status: 'Cancelled', cancelledAt: '2026-09-03T10:00:09Z' };
    vi.mocked(api.get).mockImplementation((async (url: string) => {
      if (url === '/api/workflow-runs') {
        return {
          data: { items: [cancelledMeanwhile], page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
        };
      }
      return { data: cancelledMeanwhile };
    }) as typeof api.get);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh', hidden: true }));
    await waitFor(() => expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0));

    expect(screen.getByRole('alertdialog')).toBe(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, cancel the run' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('no longer be cancelled')));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('offers no cancel on an API that sends no cancelledAt', async () => {
    renderRuns();
    fireEvent.click(await screen.findByRole('radio', { name: /Old waiting run/ }));

    await screen.findByRole('list', { name: 'Actions' });
    expect(screen.queryByRole('button', { name: 'Cancel run' })).toBeNull();
  });

  it('offers neither cancel nor retry on a stopped run', async () => {
    renderRuns();
    fireEvent.click(await screen.findByRole('radio', { name: /Stopped run/ }));

    const list = await screen.findByRole('list', { name: 'Actions' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Cancel run' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Retry action/ })).toBeNull();
  });
});

describe('a run rolled back, as contract 8 reports it', () => {
  const ROLLED_BACK = {
    ...run('run-rolled', 'Charge the card', 'Failed', [
      action(1, 'Succeeded', { compensation: { actionType: 'Webhook', status: 'Failed', attempts: 3, error: 'refund refused' } }),
      action(2, 'Failed', { retryable: true }),
    ]),
    cancelledAt: null,
    compensation: 'Incomplete',
  };
  const FAILED = { ...run('run-failed', 'Charge again', 'Failed', [action(1, 'Failed', { retryable: true })]), cancelledAt: null, compensation: null };
  const ALL = [ROLLED_BACK, FAILED];

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.get).mockImplementation((async (url: string) => {
      if (url === '/api/workflow-runs') {
        return {
          data: { items: ALL, page: 1, pageSize: 25, totalItems: ALL.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
        };
      }
      return { data: ALL.find((r) => url.endsWith(`/${r.id}`)) };
    }) as typeof api.get);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <WorkflowRunsPage />
      </QueryClientProvider>,
    );
  });

  it('offers no retry, which the API refuses on a run being undone, and says how the undoing went', async () => {
    fireEvent.click(await screen.findByRole('radio', { name: /Charge the card/ }));

    const list = await screen.findByRole('list', { name: 'Actions' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Retry action/ })).toBeNull();
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Webhook, Failed: refund refused')).toBeInTheDocument();
  });

  it('still offers the retry on a failed run nobody rolled back', async () => {
    fireEvent.click(await screen.findByRole('radio', { name: /Charge again/ }));

    await screen.findByRole('list', { name: 'Actions' });
    expect(screen.getByRole('button', { name: /Retry action 1/ })).toBeInTheDocument();
  });
});

function httpError(status: number, message?: string) {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data: message ? { message } : {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

function listOf(items: unknown[], extra: Record<string, unknown> = {}) {
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

function renderRuns(runs: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  vi.mocked(api.get).mockImplementation((async (url: string) => {
    if (url === '/api/workflow-runs') return { data: listOf(runs, extra) };
    const found = runs.find((r) => url.endsWith(`/${r.id}`));
    if (!found) throw httpError(404);
    return { data: found };
  }) as typeof api.get);
  vi.mocked(api.post).mockResolvedValue({ data: {} });

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WorkflowRunsPage />
    </QueryClientProvider>,
  );
}

const detailReads = (id: string) =>
  vi.mocked(api.get).mock.calls.filter(([url]) => String(url).endsWith(`/api/workflow-runs/${id}`)).length;

describe('the status chips', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  const COUNTS = { Pending: 1, Running: 2, Succeeded: 30, Failed: 4, PartiallyFailed: 6, Cancelled: 5 };

  it('shows a chip for every status with the count the API sent, not the count of the loaded page', async () => {
    renderRuns([run('r1', 'One', 'Failed', []), run('r2', 'Two', 'Succeeded', [])], { statusCounts: COUNTS, totalItems: 48 });
    await screen.findByRole('radio', { name: /One/ });

    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    for (const [status, count] of Object.entries(COUNTS)) {
      expect(within(group).getByTestId(`count-${status}`)).toHaveTextContent(String(count));
    }
    expect(within(group).getByTestId('count-all')).toHaveTextContent('48');
    // Two rows are loaded and Succeeded says 30, so the number cannot have been counted here.
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('names a chip with its count apart from the label, so it does not read as one word', async () => {
    renderRuns([run('r1', 'One', 'Failed', [])], { statusCounts: COUNTS, totalItems: 48 });
    await screen.findByRole('radio', { name: /One/ });

    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    expect(within(group).getByRole('button', { name: 'Failed, 4 runs' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Pending, 1 run' })).toBeInTheDocument();
  });

  it('keeps the table and says so when a refresh fails after the list has loaded', async () => {
    const loaded = [run('r1', 'One', 'Failed', [])];
    let lists = 0;
    vi.mocked(api.get).mockImplementation((async (url: string) => {
      if (url !== '/api/workflow-runs') throw httpError(404);
      lists += 1;
      if (lists > 1) throw httpError(500);
      return { data: listOf(loaded, {}) };
    }) as typeof api.get);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <WorkflowRunsPage />
      </QueryClientProvider>,
    );
    await screen.findByRole('radio', { name: /One/ });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be refreshed/);
    expect(screen.getByRole('radio', { name: /One/ })).toBeInTheDocument();
  });

  it('is a plain filter, with no counts, against an API that sends none', async () => {
    renderRuns([run('r1', 'One', 'Failed', [])]);
    await screen.findByRole('radio', { name: /One/ });

    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    expect(within(group).getAllByRole('button')).toHaveLength(7);
    expect(within(group).queryByTestId('count-Failed')).toBeNull();
  });

  it('asks the API for the status that was pressed, from page 1', async () => {
    renderRuns([run('r1', 'One', 'Failed', [])], { statusCounts: COUNTS });
    await screen.findByRole('radio', { name: /One/ });

    fireEvent.click(within(screen.getByRole('group', { name: 'Filter runs by status' })).getByRole('button', { name: /^Failed/ }));

    await waitFor(() => {
      const asked = vi.mocked(api.get).mock.calls.map(([, config]) => (config as { params?: Record<string, unknown> })?.params);
      expect(asked.some((params) => params?.status === 'Failed' && params?.page === 1)).toBe(true);
    });
  });
});

describe('the attempt history in the panel', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('lists three tries of an action in the order the API sent them', async () => {
    const history = [
      { number: 1, outcome: 'Failed', responseStatus: 502, error: 'first try failed' },
      { number: 2, outcome: 'Failed', responseStatus: 503, error: 'second try failed' },
      { number: 3, outcome: 'Succeeded', responseStatus: 200 },
    ];
    renderRuns([run('r1', 'Announce', 'Succeeded', [action(1, 'Succeeded', { attempts: 3, history, droppedAttempts: 0 })])]);
    fireEvent.click(await screen.findByRole('radio', { name: /Announce/ }));

    const tries = await screen.findByRole('list', { name: 'Tries of action 1' });
    const items = within(tries).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Try 1');
    expect(items[0]).toHaveTextContent('first try failed');
    expect(items[1]).toHaveTextContent('Try 2');
    expect(items[1]).toHaveTextContent('second try failed');
    expect(items[2]).toHaveTextContent('Try 3');
    expect(items[2]).toHaveTextContent('Succeeded');
  });

  it('says how many older tries were dropped', async () => {
    const history = [
      { number: 21, outcome: 'Failed', error: 'late' },
      { number: 22, outcome: 'Failed', error: 'later' },
    ];
    renderRuns([run('r1', 'Announce', 'Failed', [action(1, 'Failed', { attempts: 22, history, droppedAttempts: 20 })])]);
    fireEvent.click(await screen.findByRole('radio', { name: /Announce/ }));

    expect(await screen.findByText(/20 earlier tries are no longer kept/)).toBeInTheDocument();
  });

  it('shows the count and the last error for a run from an API without a history', async () => {
    renderRuns([run('r1', 'Announce', 'Failed', [action(1, 'Failed', { attempts: 3, error: 'Service Unavailable' })])]);
    fireEvent.click(await screen.findByRole('radio', { name: /Announce/ }));

    const list = await screen.findByRole('list', { name: 'Actions' });
    expect(within(list).getByText('Service Unavailable')).toBeInTheDocument();
    expect(within(list).getByText('Attempts')).toBeInTheDocument();
    expect(within(list).getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('Tries')).toBeNull();
  });
});

describe('who sees the buttons on a run', () => {
  // Something went out (action 1), one action failed, and the run is still going: every button applies.
  const LIVE = {
    ...run('r1', 'Charge the card', 'Running', [action(1, 'Succeeded'), action(2, 'Failed', { retryable: true })]),
    cancelledAt: null,
    abandonedAt: null,
  };

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  async function open() {
    renderRuns([LIVE]);
    fireEvent.click(await screen.findByRole('radio', { name: /Charge the card/ }));
    await screen.findByRole('list', { name: 'Actions' });
  }

  function seen() {
    return {
      retry: screen.queryByRole('button', { name: /Retry action/ }) !== null,
      cancel: screen.queryByRole('button', { name: 'Cancel run' }) !== null,
      abandon: screen.queryByRole('button', { name: 'Abandon run' }) !== null,
    };
  }

  const me = (capabilities: string[]) =>
    accessFrom({ userId: 'u', username: 'u', tenant: 't', roles: [{ id: 'r', name: 'Editor' }], capabilities }, ['Editor']);

  it('shows all three to a caller who holds everything', async () => {
    await open();
    expect(seen()).toEqual({ retry: true, cancel: true, abandon: true });
  });

  it('shows none with the capabilities known and none of them held', async () => {
    access = me(['view_workflow_runs']);
    expect(access.known).toBe(true);
    await open();
    expect(seen()).toEqual({ retry: false, cancel: false, abandon: false });
  });

  it('gives retry and abandon to retry_workflow_actions and cancel to manage_workflows', async () => {
    access = me(['retry_workflow_actions']);
    await open();
    expect(seen()).toEqual({ retry: true, cancel: false, abandon: true });
  });

  it('gives cancel to manage_workflows alone', async () => {
    access = me(['manage_workflows']);
    await open();
    expect(seen()).toEqual({ retry: false, cancel: true, abandon: false });
  });

  it('shows none when the capabilities are unknown and the token holds no admin role', async () => {
    access = accessFrom(null, ['Editor']);
    expect(access.known).toBe(false);
    await open();
    expect(seen()).toEqual({ retry: false, cancel: false, abandon: false });
  });

  it('falls back to the Admin role name when the capabilities are unknown', async () => {
    access = accessFrom(null, ['Admin']);
    expect(access.known).toBe(false);
    await open();
    expect(seen()).toEqual({ retry: true, cancel: true, abandon: true });
  });
});

describe('abandoning a run', () => {
  const PARTLY = {
    ...run('r1', 'Charge the card', 'PartiallyFailed', [action(1, 'Succeeded'), action(2, 'Failed')]),
    abandonedAt: null,
  };

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  async function openAndAbandon() {
    renderRuns([PARTLY]);
    fireEvent.click(await screen.findByRole('radio', { name: /Charge the card/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abandon run' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, abandon the run' }));
  }

  it('posts to the abandon route once the question is confirmed', async () => {
    await openAndAbandon();

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/workflow-runs/r1/abandon', {}));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it.each([403, 409])('shows the reason from a %i and reads the run again', async (status) => {
    const reason = 'An action of that run is running now.';
    vi.mocked(api.get).mockReset();
    renderRuns([PARTLY]);
    vi.mocked(api.post).mockRejectedValue(httpError(status, reason));
    fireEvent.click(await screen.findByRole('radio', { name: /Charge the card/ }));
    await screen.findByRole('list', { name: 'Actions' });
    const before = detailReads('r1');
    expect(before).toBeGreaterThan(0);

    fireEvent.click(await screen.findByRole('button', { name: 'Abandon run' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Yes, abandon the run' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(reason));
    await waitFor(() => expect(detailReads('r1')).toBeGreaterThan(before));
  });

  it('offers no abandon on a run nothing succeeded in', async () => {
    renderRuns([{ ...run('r2', 'Nothing went out', 'Failed', [action(1, 'Failed')]), abandonedAt: null }]);
    fireEvent.click(await screen.findByRole('radio', { name: /Nothing went out/ }));

    await screen.findByRole('list', { name: 'Actions' });
    expect(screen.queryByRole('button', { name: 'Abandon run' })).toBeNull();
  });
});

describe('text from the API stays text', () => {
  const MARKUP = '<img src=x onerror="window.pwned=1">';

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('shows markup in an error as text in the error row', async () => {
    renderRuns([run('r1', 'Announce', 'Failed', [action(1, 'Failed', { error: MARKUP })])]);
    fireEvent.click(await screen.findByRole('radio', { name: /Announce/ }));

    const list = await screen.findByRole('list', { name: 'Actions' });
    expect(within(list).getByText(MARKUP)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows markup in an error in each try, as text', async () => {
    const history = [
      { number: 1, outcome: 'Failed', error: MARKUP },
      { number: 2, outcome: 'Failed', error: 'plain' },
    ];
    renderRuns([run('r1', 'Announce', 'Failed', [action(1, 'Failed', { attempts: 2, history })])]);
    fireEvent.click(await screen.findByRole('radio', { name: /Announce/ }));

    expect(await screen.findByText(MARKUP)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('hands a refusal that carries markup to the toast as a string, which it renders as text', async () => {
    renderRuns([run('r1', 'Announce', 'Failed', [action(1, 'Failed', { retryable: true })])]);
    vi.mocked(api.post).mockRejectedValue(httpError(409, MARKUP));
    fireEvent.click(await screen.findByRole('radio', { name: /Announce/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Retry action 1/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MARKUP));
    expect(typeof vi.mocked(toast.error).mock.calls[0][0]).toBe('string');
  });
});

const GUID_ONE = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const GUID_TWO = '3f2504e0-4f89-11d3-9a0c-0305e82c3302';

describe('a link to a run', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('opens the run named by ?run= without a click', async () => {
    searchParams = new URLSearchParams(`run=${GUID_TWO}`);
    renderRuns([run(GUID_ONE, 'One', 'Failed', [action(1, 'Failed')]), run(GUID_TWO, 'Two', 'Failed', [action(1, 'Failed'), action(2, 'Failed')])]);

    const list = await screen.findByRole('list', { name: 'Actions' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Two' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Two/ })).toBeChecked();
  });

  it('says so when the id is not a run', async () => {
    searchParams = new URLSearchParams(`run=${GUID_TWO}`);
    renderRuns([run(GUID_ONE, 'One', 'Failed', [action(1, 'Failed')])]);

    expect(await screen.findByText('Run not found')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Actions' })).toBeNull();
  });

  it('asks for the canonical id when the link spells it with braces and capitals', async () => {
    searchParams = new URLSearchParams({ run: `{${GUID_TWO.toUpperCase()}}` });
    renderRuns([run(GUID_ONE, 'One', 'Failed', [action(1, 'Failed')]), run(GUID_TWO, 'Two', 'Failed', [action(1, 'Failed')])]);

    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    const asked = vi.mocked(api.get).mock.calls.map(([url]) => String(url)).filter((url) => url !== '/api/workflow-runs');
    expect(asked).toEqual(expect.arrayContaining([`/api/workflow-runs/${GUID_TWO}`]));
    expect(asked.every((url) => url === `/api/workflow-runs/${GUID_TWO}`)).toBe(true);
  });

  it('rewrites the address to the canonical id once, keeping the other parameters and the hash', async () => {
    const spelled = `{${GUID_TWO.toUpperCase()}}`;
    window.history.replaceState(null, '', `/workflow-runs?${new URLSearchParams({ run: spelled, foo: '1' })}#x`);
    searchParams = new URLSearchParams({ run: spelled, foo: '1' });
    const rewrite = vi.spyOn(window.history, 'replaceState');
    try {
      renderRuns([run(GUID_TWO, 'Two', 'Failed', [action(1, 'Failed')])]);
      await screen.findByRole('heading', { name: 'Two' });

      expect(rewrite).toHaveBeenCalledTimes(1);
      const target = new URL(String(rewrite.mock.calls[0][2]), 'http://localhost');
      expect(target.searchParams.get('run')).toBe(GUID_TWO);
      expect(target.searchParams.get('foo')).toBe('1');
      expect(target.hash).toBe('#x');
    } finally {
      rewrite.mockRestore();
      window.history.replaceState(null, '', '/');
    }
  });

  it.each(['abc', '..', '../x'])('says not found for %s without asking the API', async (link) => {
    searchParams = new URLSearchParams({ run: link });
    renderRuns([run(GUID_ONE, 'One', 'Failed', [action(1, 'Failed')])]);

    expect(await screen.findByText('Run not found')).toBeInTheDocument();
    await screen.findByRole('radio', { name: /One/ });
    expect(vi.mocked(api.get).mock.calls.filter(([url]) => String(url).startsWith('/api/workflow-runs/'))).toEqual([]);
  });

  it('keeps the chosen run open when the address follows the pick, whatever shape its id has', async () => {
    const follow = vi.spyOn(window.history, 'replaceState').mockImplementation((_state, _unused, url) => {
      searchParams = new URLSearchParams(String(url).split('?')[1]?.split('#')[0] ?? '');
    });
    try {
      renderRuns([run('run-plain', 'Plain', 'Failed', [action(1, 'Failed')])]);
      fireEvent.click(await screen.findByRole('radio', { name: /Plain/ }));

      await screen.findByRole('list', { name: 'Actions' });
      expect(screen.getByRole('radio', { name: /Plain/ })).toBeChecked();
      expect(screen.queryByText('Run not found')).toBeNull();
    } finally {
      follow.mockRestore();
    }
  });

  it('writes the chosen run into the address', async () => {
    renderRuns([run(GUID_ONE, 'One', 'Failed', [action(1, 'Failed')])]);
    fireEvent.click(await screen.findByRole('radio', { name: /One/ }));

    await screen.findByRole('list', { name: 'Actions' });
    expect(new URLSearchParams(window.location.search).get('run')).toBe(GUID_ONE);
  });
});

describe('a run with a status the console does not know', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('shows it as its own text beside the others, and leaves it out of the chips', async () => {
    renderRuns([run('r1', 'Odd one', 'Abandoned', []), run('r2', 'Usual', 'Failed', [])]);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Abandoned')).toBeInTheDocument();
    expect(within(table).getByText('Failed')).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    expect(within(group).queryByRole('button', { name: /Abandoned/ })).toBeNull();
  });
});
