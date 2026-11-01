import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { default: ActivityPage } = await import('./page');

const item = (id: string, kind = 'edited', severity = 'info') => ({
  id,
  at: '2026-11-01T11:55:00Z',
  kind,
  severity,
  actor: { kind: 'user', name: 'Mara' },
  subject: { kind: 'content', id: 'c-' + id, title: 'Title ' + id },
  text: 'did something',
  ref: '/content/c-' + id,
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ActivityPage />
    </QueryClientProvider>,
  );
}

const calls = () => vi.mocked(api.get).mock.calls.length;
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the activity page', () => {
  it('refetches every five seconds while Live and stops while Paused', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: [item('1')], nextCursor: null } });
    renderPage();
    await settle();
    expect(calls()).toBe(1);

    await tick(5000);
    expect(calls()).toBe(2);

    const feed = screen.getByRole('radiogroup', { name: 'Feed updates' });
    await user().click(within(feed).getByRole('radio', { name: 'Paused' }));
    const pausedAt = calls();
    await tick(20000);
    expect(calls()).toBe(pausedAt);

    await user().click(within(feed).getByRole('radio', { name: 'Live' }));
    await tick(5000);
    expect(calls()).toBeGreaterThan(pausedAt);
  });

  it('narrows the list to a chip and counts each chip from the loaded rows', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        items: [item('1', 'published'), item('2', 'signin'), item('3', 'run.failed', 'error'), item('4', 'edited')],
        nextCursor: null,
      },
    });
    renderPage();
    await settle();

    const group = screen.getByRole('group', { name: 'Filter activity' });
    expect(within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem')).toHaveLength(4);
    expect(within(group).getByRole('button', { name: /Everything/ })).toHaveTextContent('4');
    expect(within(group).getByRole('button', { name: /Problems/ })).toHaveTextContent('1');

    await user().click(within(group).getByRole('button', { name: /Sign-ins/ }));

    const rows = within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Title 2');
    expect(within(group).getByRole('button', { name: /Sign-ins/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('says nothing has happened yet for an empty feed', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: [], nextCursor: null } });
    renderPage();
    await settle();

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText('Activity on the site shows up here.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Activity' })).toBeNull();
  });

  it('says no loaded activity matches when rows exist but the chip keeps none', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: [item('1', 'edited')], nextCursor: null } });
    renderPage();
    await settle();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    await user().click(screen.getByRole('button', { name: /Imports/ }));

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText('No loaded activity matches this filter.')).toBeInTheDocument();
  });

  it('loads the next page by cursor and hides the button on the last page', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { items: [item('1')], nextCursor: 'c2' } })
      .mockResolvedValue({ data: { items: [item('2')], nextCursor: null } });
    renderPage();
    await settle();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    await user().click(screen.getByRole('button', { name: 'Load older activity' }));
    await settle();

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Title 2')).toBeInTheDocument();
    const params = vi.mocked(api.get).mock.calls.map((c) => (c[1] as { params: Record<string, unknown> }).params);
    expect(params.some((p) => p.cursor === 'c2')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Load older activity' })).toBeNull();
  });
});
