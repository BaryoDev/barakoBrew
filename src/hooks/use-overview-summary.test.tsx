import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => 'cafe' }));

const { api } = await import('@/lib/api');
const { useOverviewSummary, useResolveOverviewItem } = await import('./use-overview-summary');

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.resetAllMocks());

describe('useOverviewSummary', () => {
  it('reads the verdict, headline and needs-you list from GET /api/overview', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        verdict: 'warn',
        headline: '1 warning',
        needsYou: [{ id: 'mail.bounces', severity: 'warn', text: '2 email bounces to look at.', ref: { kind: 'mailBounces' }, resolvable: true }],
        health: { verdict: 'warn', items: [{ name: 'Mail', status: 'warn', detail: '2 bounces waiting.' }] },
      },
    });
    const { result } = renderHook(() => useOverviewSummary(), { wrapper });
    await waitFor(() => expect(result.current.summary).toBeDefined());
    expect(api.get).toHaveBeenCalledWith('/api/overview');
    expect(result.current.summary?.verdict).toBe('warn');
    expect(result.current.summary?.headline).toBe('1 warning');
    expect(result.current.summary?.needsYou[0].resolvable).toBe(true);
  });

  it('is unavailable against a core without the route', async () => {
    vi.mocked(api.get).mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    const { result } = renderHook(() => useOverviewSummary(), { wrapper });
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.summary).toBeUndefined();
  });
});

describe('severity and polling', () => {
    it('reads an unknown severity as warn, not ok', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { verdict: 'strange', headline: 'x', needsYou: [] } });
        const { result } = renderHook(() => useOverviewSummary(), { wrapper });
        await waitFor(() => expect(result.current.summary).toBeDefined());
        expect(result.current.summary?.verdict).toBe('warn');
    });

    it('asks once, not on a timer, after the route answered 403', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.mocked(api.get).mockRejectedValue({ isAxiosError: true, response: { status: 403 } });
        const { result } = renderHook(() => useOverviewSummary(), { wrapper });
        await waitFor(() => expect(result.current.unavailable).toBe(true));
        await vi.advanceTimersByTimeAsync(120_000);
        expect(api.get).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});

describe('useResolveOverviewItem', () => {
  it('posts to the resolve route of the item', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useResolveOverviewItem(), { wrapper });
    await result.current.mutateAsync('mail.bounces');
    expect(api.post).toHaveBeenCalledWith('/api/overview/items/mail.bounces/resolve');
  });
});
