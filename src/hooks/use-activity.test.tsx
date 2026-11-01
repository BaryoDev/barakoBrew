import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { NAV_GROUPS, withoutHrefs } from '@/lib/navigation';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { useActivity, useActivityAvailable } = await import('./use-activity');

function httpError(status: number) {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: {},
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

const item = (id: string) => ({
  id,
  at: '2026-11-01T11:55:00Z',
  kind: 'edited',
  severity: 'info',
  actor: { kind: 'user', name: 'Mara' },
  subject: { kind: 'content', id: 'c-1', title: 'Spring menu' },
  text: 'edited',
  ref: '/content/c-1',
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('useActivity', () => {
  it('pages by the cursor the API returned', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { items: [item('a')], nextCursor: 'c2' } })
      .mockResolvedValueOnce({ data: { items: [item('b')], nextCursor: null } });
    const { result } = renderHook(() => useActivity(false), { wrapper });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);
    result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    const calls = vi.mocked(api.get).mock.calls;
    expect(calls[0][0]).toBe('/api/activity');
    expect((calls[0][1] as { params: Record<string, unknown> }).params.cursor).toBeUndefined();
    expect((calls[1][1] as { params: Record<string, unknown> }).params.cursor).toBe('c2');
    expect(result.current.hasNextPage).toBe(false);
  });

  it('fails on a response that is not a feed rather than showing an empty one', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { versions: [] } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useActivity(false), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('the Activity rail item', () => {
  it('is dropped when the endpoint answers 404', async () => {
    vi.mocked(api.get).mockRejectedValue(httpError(404));
    const { result } = renderHook(() => useActivityAvailable(), { wrapper });

    await waitFor(() => expect(result.current).toBe(false));
    const hrefs = withoutHrefs(NAV_GROUPS, new Set(['/activity'])).flatMap((g) => g.items.map((i) => i.href));
    expect(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))).toContain('/activity');
    expect(hrefs).not.toContain('/activity');
    expect(hrefs).toContain('/audit');
  });

  it('stays when the endpoint answers', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: [], nextCursor: null } });
    const { result } = renderHook(() => useActivityAvailable(), { wrapper });

    await waitFor(() => expect(vi.mocked(api.get)).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('stays when the request fails for any other reason', async () => {
    vi.mocked(api.get).mockRejectedValue(httpError(500));
    const { result } = renderHook(() => useActivityAvailable(), { wrapper });

    await waitFor(() => expect(vi.mocked(api.get)).toHaveBeenCalled());
    expect(result.current).toBe(true);
  });
});
