import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { accessFrom } = await vi.importActual<typeof import('@/lib/access')>('@/lib/access');
const everything = accessFrom({ userId: 'u', username: 'u', tenant: 't', roles: [], capabilities: ['*'] }, []);
vi.mock('@/hooks/use-access', () => ({ useAccess: () => everything }));

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { api } = await import('@/lib/api');
const { default: WorkflowRunsPage } = await import('./page');

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

function renderRuns(runs: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  vi.mocked(api.get).mockImplementation((async (url: string) => {
    if (url === '/api/workflow-runs') {
      return {
        data: {
          items: runs,
          page: 1,
          pageSize: 25,
          totalItems: runs.length,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
          ...extra,
        },
      };
    }
    return { data: runs.find((r) => url.endsWith(`/${r.id}`)) };
  }) as typeof api.get);

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

const PARTLY = run('r-partly', 'Charge the card', 'PartiallyFailed', [action(1, 'Succeeded'), action(2, 'Failed')]);

describe('the run list and panel wording', () => {
  it('says Partly failed on the chip, the row and the panel, never the enum name', async () => {
    renderRuns([PARTLY], { statusCounts: { PartiallyFailed: 6 }, totalItems: 6 });
    await screen.findByRole('radio', { name: /Charge the card/ });

    const group = screen.getByRole('group', { name: 'Filter runs by status' });
    expect(within(group).getByRole('button', { name: 'Partly failed, 6 runs' })).toBeInTheDocument();
    expect(within(screen.getAllByRole('row')[1]).getByText('Partly failed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Charge the card/ }));
    await screen.findByRole('list', { name: 'Actions' });

    expect(screen.getAllByText('Partly failed')).toHaveLength(3);
    expect(screen.queryByText('PartiallyFailed')).toBeNull();
  });

  it('draws one bar for each action of a run, coloured by what the action did', async () => {
    renderRuns([PARTLY]);
    await screen.findByRole('radio', { name: /Charge the card/ });

    const bars = within(screen.getAllByRole('row')[1]).getAllByTestId('action-bar');
    expect(bars).toHaveLength(2);
    expect(bars.map((bar) => bar.getAttribute('data-status'))).toEqual(['Succeeded', 'Failed']);
    expect(bars[0].className).not.toEqual(bars[1].className);
    expect(screen.getByRole('img', { name: 'Actions: 1 Succeeded, 2 Failed' })).toBeInTheDocument();
  });

  it('draws no bars for a run that carried no actions', async () => {
    renderRuns([run('r-empty', 'Nothing to do', 'Succeeded', [])]);
    await screen.findByRole('radio', { name: /Nothing to do/ });

    expect(screen.queryAllByTestId('action-bar')).toHaveLength(0);
  });

  it('marks a permanent failure in the row', async () => {
    renderRuns([run('r-perm', 'Post to chat', 'Failed', [action(1, 'Failed', { retryable: false })])]);
    await screen.findByRole('radio', { name: /Post to chat/ });

    expect(within(screen.getAllByRole('row')[1]).getByText('Permanent')).toBeInTheDocument();
  });

  it('explains an Unknown outcome under the actions, and only when one is there', async () => {
    const unknown = run('r-unknown', 'Notify the team', 'Failed', [
      action(1, 'Unknown', { error: 'The request timed out.' }),
    ]);
    renderRuns([unknown, run('r-ok', 'Quiet run', 'Succeeded', [action(1, 'Succeeded')])]);

    fireEvent.click(await screen.findByRole('radio', { name: /Notify the team/ }));
    await screen.findByRole('list', { name: 'Actions' });
    expect(screen.getByText(/same idempotency key/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Quiet run/ }));
    await waitFor(() => expect(screen.queryByText(/same idempotency key/)).toBeNull());
    expect(screen.getByRole('list', { name: 'Actions' })).toBeInTheDocument();
  });
});
