import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn() } };
});
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { userId: 'u1', roles: ['SuperAdmin'] } }),
}));
vi.mock('@/hooks/use-access', () => ({
  useAccess: () => ({ known: false, can: () => true }),
}));
vi.mock('@/hooks/use-modules', () => ({
  useEnabledModules: () => undefined,
}));

const { api } = await import('@/lib/api');
const { useAllowedGroups, hrefsOf } = await import('./use-visible-hrefs');

function httpError(status: number) {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: {},
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('the groups a caller is offered', () => {
  it('drops the Activity link once the API answers 404 for the feed', async () => {
    vi.mocked(api.get).mockRejectedValue(httpError(404));
    const { result } = renderHook(() => useAllowedGroups(), { wrapper });

    await waitFor(() => expect(hrefsOf(result.current).has('/activity')).toBe(false));
    expect(vi.mocked(api.get).mock.calls[0][0]).toBe('/api/activity');
    const hrefs = hrefsOf(result.current);
    expect(hrefs.size).toBeGreaterThan(1);
    expect(hrefs.has('/audit')).toBe(true);
  });

  it('keeps the Activity link when the feed answers', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: [], nextCursor: null } });
    const { result } = renderHook(() => useAllowedGroups(), { wrapper });

    await waitFor(() => expect(vi.mocked(api.get)).toHaveBeenCalled());
    await waitFor(() => expect(hrefsOf(result.current).has('/activity')).toBe(true));
    expect(hrefsOf(result.current).has('/audit')).toBe(true);
  });
});
