import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix sizes its dialog with one, and jsdom ships no implementation.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { api } = await import('@/lib/api');
const { default: WorkflowRunsPage } = await import('./page');

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
