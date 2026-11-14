import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setViewportWidth } from '@/test/setup';

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
  fireEvent.click(await screen.findByRole('button', { name: /Announce a post/ }));
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
    await screen.findByRole('button', { name: /Announce a post/ });

    const rows = within(screen.getByRole('list', { name: 'Runs' })).getAllByRole('listitem');
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

  let client: QueryClient;

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

    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
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
    fireEvent.click(await screen.findByRole('button', { name: /Send the invoice/ }));

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel run' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, cancel the run' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/workflow-runs/run-wait/cancel', {}));
  });

  it('keeps the confirmation open when a refresh shows the run has since been cancelled, and does not send the request', async () => {
    renderRuns();
    fireEvent.click(await screen.findByRole('button', { name: /Send the invoice/ }));
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
    // What the poll does every two seconds, asked for now.
    await act(async () => {
      await client.refetchQueries({ queryKey: ['workflow-runs'] });
      await client.refetchQueries({ queryKey: ['workflow-run'] });
    });
    await waitFor(() => expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0));

    expect(screen.getByRole('alertdialog')).toBe(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, cancel the run' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('no longer be cancelled')));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('offers no cancel on an API that sends no cancelledAt', async () => {
    renderRuns();
    fireEvent.click(await screen.findByRole('button', { name: /Old waiting run/ }));

    await screen.findByRole('list', { name: 'Actions' });
    expect(screen.queryByRole('button', { name: 'Cancel run' })).toBeNull();
  });

  it('offers neither cancel nor retry on a stopped run', async () => {
    renderRuns();
    fireEvent.click(await screen.findByRole('button', { name: /Stopped run/ }));

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
    fireEvent.click(await screen.findByRole('button', { name: /Charge the card/ }));

    const list = await screen.findByRole('list', { name: 'Actions' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Retry action/ })).toBeNull();
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Webhook, Failed: refund refused')).toBeInTheDocument();
  });

  it('still offers the retry on a failed run nobody rolled back', async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Charge again/ }));

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
  // Pending has no segment of its own, and Running does not count it, since Running lists only Running.
  const SEGMENT_COUNTS: Record<string, number> = { Running: 2, Succeeded: 30, Failed: 4, PartiallyFailed: 6, Cancelled: 5 };

  it('shows a segment for every status with the count the API sent, not the count of the loaded page', async () => {
    renderRuns([run('r1', 'One', 'Failed', []), run('r2', 'Two', 'Succeeded', [])], { statusCounts: COUNTS, totalItems: 48 });
    await screen.findByRole('button', { name: /One/ });

    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    for (const [status, count] of Object.entries(SEGMENT_COUNTS)) {
      expect(within(group).getByTestId(`count-${status}`)).toHaveTextContent(String(count));
    }
    expect(within(group).getByTestId('count-all')).toHaveTextContent('48');
    // Two rows are loaded and Succeeded says 30, so the number cannot have been counted here.
    expect(within(screen.getByRole('list', { name: 'Runs' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('names a chip with its count apart from the label, so it does not read as one word', async () => {
    renderRuns([run('r1', 'One', 'Failed', [])], { statusCounts: COUNTS, totalItems: 48 });
    await screen.findByRole('button', { name: /One/ });

    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    expect(within(group).getByRole('button', { name: 'Failed, 4 runs' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Partly failed, 6 runs' })).toBeInTheDocument();
  });

  it('leaves Pending out of Running and says Partly failed, with no Pending segment', async () => {
    renderRuns([run('r1', 'One', 'Failed', [])], { statusCounts: COUNTS, totalItems: 48 });
    await screen.findByRole('button', { name: /One/ });

    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    expect(within(group).getByRole('button', { name: 'Running, 2 runs' })).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: /^Pending/ })).toBeNull();
    expect(within(group).queryByRole('button', { name: /^PartiallyFailed/ })).toBeNull();
    expect(within(group).getAllByRole('button').map((b) => b.textContent?.replace(/\d+$/, ''))).toEqual([
      'Every status', 'Running', 'Failed', 'Partly failed', 'Succeeded', 'Cancelled',
    ]);
  });

  it('keeps the list and says so when a refresh fails after the list has loaded', async () => {
    const loaded = [run('r1', 'One', 'Failed', [])];
    let lists = 0;
    vi.mocked(api.get).mockImplementation((async (url: string) => {
      if (url !== '/api/workflow-runs') throw httpError(404);
      lists += 1;
      if (lists > 1) throw httpError(500);
      return { data: listOf(loaded, {}) };
    }) as typeof api.get);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <WorkflowRunsPage />
      </QueryClientProvider>,
    );
    await screen.findByRole('button', { name: /One/ });

    await act(async () => {
      await client.refetchQueries({ queryKey: ['workflow-runs'] });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be refreshed/);
    expect(screen.getByRole('button', { name: /One/ })).toBeInTheDocument();
  });

  it('is a plain filter, with no counts, against an API that sends none', async () => {
    renderRuns([run('r1', 'One', 'Failed', [])]);
    await screen.findByRole('button', { name: /One/ });

    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    expect(within(group).getAllByRole('button')).toHaveLength(6);
    expect(within(group).queryByTestId('count-Failed')).toBeNull();
  });

  it('asks the API for the status that was pressed, from page 1', async () => {
    renderRuns([run('r1', 'One', 'Failed', [])], { statusCounts: COUNTS });
    await screen.findByRole('button', { name: /One/ });

    fireEvent.click(within(screen.getByRole('group', { name: 'Filter runs by status' })).getByRole('button', { name: /^Failed/ }));

    await waitFor(() => {
      const asked = vi.mocked(api.get).mock.calls.map(([, config]) => (config as { params?: Record<string, unknown> })?.params);
      expect(asked.some((params) => params?.status === 'Failed' && params?.page === 1)).toBe(true);
    });
  });
});

describe('the Live switch', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('starts Live and flips to Paused and back', async () => {
    renderRuns([run('r1', 'One', 'Failed', [])]);
    await screen.findByRole('button', { name: /One/ });

    const live = screen.getByRole('switch', { name: 'Live updates' });
    expect(live).toHaveAttribute('aria-checked', 'true');
    expect(live).toHaveTextContent('Live');

    fireEvent.click(live);
    expect(screen.getByRole('switch', { name: 'Live updates' })).toHaveTextContent('Paused');
    expect(screen.getByRole('switch', { name: 'Live updates' })).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('switch', { name: 'Live updates' }));
    expect(screen.getByRole('switch', { name: 'Live updates' })).toHaveTextContent('Live');
  });

  it('keeps the list readable and the rows selectable while paused', async () => {
    renderRuns([run('r1', 'One', 'Failed', [])]);
    await screen.findByRole('button', { name: /One/ });
    fireEvent.click(screen.getByRole('switch', { name: 'Live updates' }));

    fireEvent.click(screen.getByRole('button', { name: /One/ }));
    expect(await screen.findByRole('heading', { name: 'One' })).toBeInTheDocument();
  });
});

describe('picking a run on one column', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('scrolls to the detail below 1180px, after the render', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    setViewportWidth(900);
    renderRuns([run('r1', 'One', 'Failed', [])]);

    fireEvent.click(await screen.findByRole('button', { name: /One/ }));

    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
  });

  it('does not scroll on two columns', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderRuns([run('r1', 'One', 'Failed', [])]);

    fireEvent.click(await screen.findByRole('button', { name: /One/ }));
    await screen.findByRole('heading', { name: 'One' });

    expect(scroll).not.toHaveBeenCalled();
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
    fireEvent.click(await screen.findByRole('button', { name: /Announce/ }));

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
    fireEvent.click(await screen.findByRole('button', { name: /Announce/ }));

    expect(await screen.findByText(/20 earlier tries are no longer kept/)).toBeInTheDocument();
  });

  it('shows the count and the last error for a run from an API without a history', async () => {
    renderRuns([run('r1', 'Announce', 'Failed', [action(1, 'Failed', { attempts: 3, error: 'Service Unavailable' })])]);
    fireEvent.click(await screen.findByRole('button', { name: /Announce/ }));

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
    fireEvent.click(await screen.findByRole('button', { name: /Charge the card/ }));
    await screen.findByRole('list', { name: 'Actions' });
  }

  function seen() {
    return {
      retry: screen.queryByRole('button', { name: /Retry action/ }) !== null,
      cancel: screen.queryByRole('button', { name: 'Cancel run' }) !== null,
      abandon: screen.queryByRole('button', { name: 'Abandon' }) !== null,
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
    fireEvent.click(await screen.findByRole('button', { name: /Charge the card/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abandon' }));
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
    fireEvent.click(await screen.findByRole('button', { name: /Charge the card/ }));
    await screen.findByRole('list', { name: 'Actions' });
    const before = detailReads('r1');
    expect(before).toBeGreaterThan(0);

    fireEvent.click(await screen.findByRole('button', { name: 'Abandon' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Yes, abandon the run' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(reason));
    await waitFor(() => expect(detailReads('r1')).toBeGreaterThan(before));
  });

  it('offers no abandon on a run nothing succeeded in', async () => {
    renderRuns([{ ...run('r2', 'Nothing went out', 'Failed', [action(1, 'Failed')]), abandonedAt: null }]);
    fireEvent.click(await screen.findByRole('button', { name: /Nothing went out/ }));

    await screen.findByRole('list', { name: 'Actions' });
    expect(screen.queryByRole('button', { name: 'Abandon' })).toBeNull();
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
    fireEvent.click(await screen.findByRole('button', { name: /Announce/ }));

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
    fireEvent.click(await screen.findByRole('button', { name: /Announce/ }));

    expect(await screen.findByText(MARKUP)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('hands a refusal that carries markup to the toast as a string, which it renders as text', async () => {
    renderRuns([run('r1', 'Announce', 'Failed', [action(1, 'Failed', { retryable: true })])]);
    vi.mocked(api.post).mockRejectedValue(httpError(409, MARKUP));
    fireEvent.click(await screen.findByRole('button', { name: /Announce/ }));
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
    expect(screen.getByRole('button', { name: /Two/ })).toHaveAttribute('aria-pressed', 'true');
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
    await screen.findByRole('button', { name: /One/ });
    expect(vi.mocked(api.get).mock.calls.filter(([url]) => String(url).startsWith('/api/workflow-runs/'))).toEqual([]);
  });

  it('keeps the chosen run open when the address follows the pick, whatever shape its id has', async () => {
    const follow = vi.spyOn(window.history, 'replaceState').mockImplementation((_state, _unused, url) => {
      searchParams = new URLSearchParams(String(url).split('?')[1]?.split('#')[0] ?? '');
    });
    try {
      renderRuns([run('run-plain', 'Plain', 'Failed', [action(1, 'Failed')])]);
      fireEvent.click(await screen.findByRole('button', { name: /Plain/ }));

      await screen.findByRole('list', { name: 'Actions' });
      expect(screen.getByRole('button', { name: /Plain/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByText('Run not found')).toBeNull();
    } finally {
      follow.mockRestore();
    }
  });

  it('writes the chosen run into the address', async () => {
    renderRuns([run(GUID_ONE, 'One', 'Failed', [action(1, 'Failed')])]);
    fireEvent.click(await screen.findByRole('button', { name: /One/ }));

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

    const list = await screen.findByRole('list', { name: 'Runs' });
    expect(within(list).getByText('Abandoned')).toBeInTheDocument();
    expect(within(list).getByText('Failed')).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    expect(within(group).queryByRole('button', { name: /Abandoned/ })).toBeNull();
  });
});

describe('the run list as cards', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  const PARTLY = {
    ...run('r-partly', 'Publish and announce', 'PartiallyFailed', [action(1, 'Succeeded'), action(2, 'Unknown'), action(3, 'Skipped')]),
    triggerEvent: 'Article → In review',
    executor: null,
    abandonedAt: null,
  };
  const PERMANENT = run('r-perm', 'Welcome email', 'Failed', [action(1, 'Failed', { retryable: false })]);

  it('has a Live pill and no Refresh button', async () => {
    renderRuns([PARTLY]);
    await screen.findByRole('button', { name: /Publish and announce/ });

    expect(screen.getByRole('switch', { name: 'Live updates' })).toHaveTextContent('Live');
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });

  it('lists runs as buttons, with no table and no radios', async () => {
    renderRuns([PARTLY, PERMANENT]);
    await screen.findByRole('button', { name: /Publish and announce/ });

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const rows = within(screen.getByRole('list', { name: 'Runs' })).getAllByRole('button');
    expect(rows).toHaveLength(2);
  });

  it('says Partly failed in the row and in the open run, never PartiallyFailed', async () => {
    renderRuns([PARTLY]);
    const row = await screen.findByRole('button', { name: /Publish and announce/ });

    expect(within(row).getByText('Partly failed')).toBeInTheDocument();
    fireEvent.click(row);
    await screen.findByRole('list', { name: 'Actions' });

    expect(screen.queryByText('PartiallyFailed')).toBeNull();
    const title = screen.getByRole('heading', { name: 'Publish and announce' });
    expect(within(title.parentElement as HTMLElement).getByText('Partly failed')).toBeInTheDocument();
  });

  it('shows a Permanent badge on a run whose failure a retry will not fix', async () => {
    renderRuns([PERMANENT]);
    const row = await screen.findByRole('button', { name: /Welcome email/ });

    expect(within(row).getByText('Failed')).toBeInTheDocument();
    expect(within(row).getByText('Permanent')).toBeInTheDocument();
  });

  it('puts the workflow and the entry on one line, the trigger in words below it, and one bar per action', async () => {
    renderRuns([PARTLY]);
    const row = await screen.findByRole('button', { name: /Publish and announce/ });

    expect(within(row).getByText('Publish and announce')).toBeInTheDocument();
    expect(within(row).getByText(/article 11111111/)).toBeInTheDocument();
    const trigger = within(row).getByText('Article to In review');
    expect(trigger).toHaveClass('font-mono');
    expect(trigger.textContent).not.toMatch(/→/);

    const bars = within(row).getAllByTestId('progress-segment');
    expect(bars).toHaveLength(3);
    expect(bars[0]).toHaveClass('bg-success');
    expect(bars[1]).toHaveClass('bg-warning');
    expect(bars[2]).toHaveClass('bg-border');
  });

  it('keeps the trigger whole, with no truncation to clip it', async () => {
    renderRuns([{ ...PARTLY, triggerEvent: 'A very long trigger event name that must not be cut off' }]);
    const row = await screen.findByRole('button', { name: /Publish and announce/ });

    const trigger = within(row).getByText('A very long trigger event name that must not be cut off');
    expect(trigger).not.toHaveClass('truncate');
  });

  it('keeps every status filter on one row', async () => {
    renderRuns([PARTLY]);
    await screen.findByRole('button', { name: /Publish and announce/ });

    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    expect(group).toHaveClass('flex-nowrap');
    for (const chip of within(group).getAllByRole('button')) expect(chip).toHaveClass('whitespace-nowrap');
  });

  it('selects a run on a click', async () => {
    renderRuns([PARTLY, PERMANENT]);
    const row = await screen.findByRole('button', { name: /Welcome email/ });
    expect(row).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(row);

    expect(await screen.findByRole('heading', { name: 'Welcome email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Welcome email/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Publish and announce/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it.each([['{Enter}'], [' ']])('selects a run from the keyboard with %j', async (key) => {
    const user = userEvent.setup();
    renderRuns([PARTLY, PERMANENT]);
    const row = await screen.findByRole('button', { name: /Welcome email/ });

    row.focus();
    await user.keyboard(key);

    expect(await screen.findByRole('heading', { name: 'Welcome email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Welcome email/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reaches a run by tabbing past the filter and into the list', async () => {
    const user = userEvent.setup();
    renderRuns([PERMANENT]);
    const row = await screen.findByRole('button', { name: /Welcome email/ });

    for (let i = 0; i < 20 && document.activeElement !== row; i++) await user.tab();

    expect(row).toHaveFocus();
  });
});

describe('the open run, as the design draws it', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  const UNKNOWN = {
    ...run('r-unknown', 'Publish and announce', 'PartiallyFailed', [
      action(1, 'Succeeded'),
      action(2, 'Unknown', { actionType: 'HttpRequest', error: 'Timed out after 30 s.' }),
      action(3, 'Skipped', { haltedBy: 2, error: null }),
    ]),
    executor: null,
    abandonedAt: null,
    cancelledAt: null,
  };

  async function open() {
    renderRuns([UNKNOWN]);
    fireEvent.click(await screen.findByRole('button', { name: /Publish and announce/ }));
    return screen.findByRole('list', { name: 'Actions' });
  }

  it('lists the facts: Trigger, Content type, Content, Started, Finished, Runs on and Run', async () => {
    await open();

    for (const label of ['Trigger', 'Content type', 'Content', 'Started', 'Finished', 'Runs on', 'Run']) {
      expect(screen.getByText(label, { selector: 'dt' })).toBeInTheDocument();
    }
    expect(screen.getByText('built-in runner')).toBeInTheDocument();
    expect(screen.getByText('r-unknown', { selector: 'dd' })).toBeInTheDocument();
  });

  it('draws one numbered node per action on the timeline', async () => {
    const list = await open();

    const nodes = within(list).getAllByTestId('timeline-node');
    expect(nodes.map((node) => node.textContent)).toEqual(['1', '2', '3']);
  });

  it('shows the type, the status, Attempts and Took on a card, and Retry on the Unknown one only', async () => {
    const list = await open();
    const cards = within(list).getAllByRole('listitem');

    expect(within(cards[1]).getByText('HttpRequest')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Unknown')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Attempts')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Took')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Timed out after 30 s.').tagName).toBe('PRE');
    expect(within(cards[1]).getByRole('button', { name: /Retry action 2/ })).toBeInTheDocument();
    expect(within(cards[0]).queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(within(cards[2]).queryByRole('button', { name: /Retry/ })).toBeNull();
  });

  it('says why an action was skipped', async () => {
    const list = await open();
    const cards = within(list).getAllByRole('listitem');

    expect(within(cards[2]).getByText('Skipped because')).toBeInTheDocument();
    expect(within(cards[2]).getByText('action 2 failed')).toBeInTheDocument();
  });

  it('explains an Unknown outcome and the idempotency key under the timeline', async () => {
    await open();

    const note = screen.getByTestId('run-note');
    expect(note).toHaveTextContent(/may already have gone out/);
    expect(note).toHaveTextContent(/idempotency key/);
  });

  it('keeps Abandon, the API\'s name for the action the design calls Cancel run', async () => {
    await open();

    expect(screen.getByRole('button', { name: 'Abandon' })).toBeInTheDocument();
  });
});

describe('the open run across the poll', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('keeps the selection and an open dialog when the list is read again', async () => {
    const PARTLY = {
      ...run('r-keep', 'Charge the card', 'PartiallyFailed', [action(1, 'Succeeded'), action(2, 'Failed')]),
      abandonedAt: null,
    };
    vi.mocked(api.get).mockImplementation((async (url: string) => {
      if (url === '/api/workflow-runs') return { data: listOf([PARTLY]) };
      return { data: PARTLY };
    }) as typeof api.get);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <WorkflowRunsPage />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Charge the card/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abandon' }));
    const dialog = await screen.findByRole('alertdialog');

    await act(async () => {
      await client.refetchQueries({ queryKey: ['workflow-runs'] });
      await client.refetchQueries({ queryKey: ['workflow-run'] });
    });

    expect(screen.getByRole('alertdialog')).toBe(dialog);
    // The dialog is modal, so the rest of the page is hidden from the accessibility tree.
    expect(screen.getByRole('button', { name: /Charge the card/, hidden: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('list', { name: 'Actions', hidden: true })).toBeInTheDocument();
  });
});

describe('the open run after a poll that changes it', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('keeps the same row node selected and focused, and its detail shown, when a refetch changes its status', async () => {
    let current = { ...run('r-poll', 'Charge the card', 'Running', [action(1, 'Running')]), abandonedAt: null };
    vi.mocked(api.get).mockImplementation((async (url: string) => {
      if (url === '/api/workflow-runs') return { data: listOf([current]) };
      return { data: current };
    }) as typeof api.get);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <WorkflowRunsPage />
      </QueryClientProvider>,
    );
    const row = await screen.findByRole('button', { name: /Charge the card/ });
    fireEvent.click(row);
    await screen.findByRole('list', { name: 'Actions' });
    row.focus();
    expect(within(row).getByText('Running')).toBeInTheDocument();

    current = { ...current, status: 'Succeeded', actions: [action(1, 'Succeeded')] };
    await act(async () => {
      await client.refetchQueries({ queryKey: ['workflow-runs'] });
      await client.refetchQueries({ queryKey: ['workflow-run'] });
    });

    // The status changed, so the refetch really landed.
    await waitFor(() => expect(within(row).getByText('Succeeded')).toBeInTheDocument());
    const after = screen.getByRole('button', { name: /Charge the card/ });
    expect(after).toBe(row);
    expect(after).toHaveAttribute('aria-pressed', 'true');
    expect(after).toHaveFocus();
    expect(screen.getByRole('list', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Charge the card' })).toBeInTheDocument();
  });
});

describe('the note under the timeline on a run that cannot be retried', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('says rolled back, and does not invite a retry, on an abandoned PartiallyFailed run', async () => {
    const abandoned = {
      ...run('r-ab', 'Charge the card', 'PartiallyFailed', [action(1, 'Succeeded'), action(2, 'Unknown')]),
      abandonedAt: '2026-09-03T10:00:09Z',
      compensation: 'Compensated',
    };
    renderRuns([abandoned]);
    fireEvent.click(await screen.findByRole('button', { name: /Charge the card/ }));
    await screen.findByRole('list', { name: 'Actions' });

    const note = screen.getByTestId('run-note');
    expect(note).toHaveTextContent('Rolled back or abandoned. Its actions are not retried.');
    expect(note).not.toHaveTextContent(/idempotency key/);
    expect(note).not.toHaveTextContent(/Retrying the failed action/);
  });

  it('says cancelled on a cancelled Failed run, with no permanent-failure advice', async () => {
    const cancelled = {
      ...run('r-can', 'Send the invoice', 'Failed', [action(1, 'Failed', { retryable: false })]),
      cancelledAt: '2026-09-03T10:00:03Z',
    };
    renderRuns([cancelled]);
    fireEvent.click(await screen.findByRole('button', { name: /Send the invoice/ }));
    await screen.findByRole('list', { name: 'Actions' });

    const note = screen.getByTestId('run-note');
    expect(note).toHaveTextContent('A cancelled run cannot be retried.');
    expect(note).not.toHaveTextContent(/A retry then asks you to confirm/);
  });
});

describe('a run with no usable start time', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('says n/a in the row and in the Started fact when createdAt is garbage', async () => {
    renderRuns([{ ...run('r-bad', 'Charge the card', 'Failed', [action(1, 'Failed')]), createdAt: 'garbage' }]);
    const row = await screen.findByRole('button', { name: /Charge the card/ });

    expect(within(row).getByText('n/a')).toBeInTheDocument();
    fireEvent.click(row);
    await screen.findByRole('list', { name: 'Actions' });

    expect(screen.getByText('Started', { selector: 'dt' }).nextElementSibling).toHaveTextContent('n/a');
  });
});

describe('a link to a status', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('opens on ?status=PartiallyFailed with that chip on and asks the API for it', async () => {
    searchParams = new URLSearchParams('status=PartiallyFailed');
    renderRuns([run('r1', 'One', 'PartiallyFailed', [])]);
    await screen.findByRole('button', { name: /One/ });

    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    expect(within(group).getByRole('button', { name: /^Partly failed/ })).toHaveAttribute('aria-pressed', 'true');
    const listCall = vi.mocked(api.get).mock.calls.find(([url]) => url === '/api/workflow-runs');
    expect((listCall?.[1] as { params: { status?: string } }).params.status).toBe('PartiallyFailed');
  });

  it('shows every status for a status the chips do not offer', async () => {
    searchParams = new URLSearchParams('status=Bogus');
    renderRuns([run('r1', 'One', 'Failed', [])]);
    await screen.findByRole('button', { name: /One/ });

    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    expect(within(group).getByRole('button', { name: /^Every status/ })).toHaveAttribute('aria-pressed', 'true');
  });
});


describe('the run open on load', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('opens the first run of the list without a click', async () => {
    renderPage();

    const list = await screen.findByRole('list', { name: 'Actions' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Announce a post' })).toBeInTheDocument();
    expect(screen.queryByText('Choose a run')).not.toBeInTheDocument();

    const rows = within(screen.getByRole('list', { name: 'Runs' })).getAllByRole('button');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute('aria-pressed', 'true');
    expect(rows[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it('leaves a run named in the address alone', async () => {
    searchParams = new URLSearchParams({ run: 'run-temp' });
    renderPage();

    // The id is not shaped like a run id, so the link is answered as not found and the first run
    // is not put in its place.
    expect(await screen.findByText('Run not found')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('moves the selection to the run that is clicked', async () => {
    renderPage();
    await screen.findByRole('list', { name: 'Actions' });

    fireEvent.click(screen.getByRole('button', { name: /Push to the CDN/ }));

    expect(await screen.findByRole('heading', { name: 'Push to the CDN' })).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Runs' })).getAllByRole('button');
    expect(rows[1]).toHaveAttribute('aria-pressed', 'true');
    expect(rows[0]).toHaveAttribute('aria-pressed', 'false');
  });
});
