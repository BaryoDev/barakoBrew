import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The type list across a tenant switch. A switch only invalidates, so without the tenant in the key
 * the first tenant's types stay on screen until the second tenant's answer lands.
 */
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn() } };
});

const { api, tokenStore } = await import('@/lib/api');
const { useSchemas } = await import('./use-schemas');

const tokenFor = (tenant: string) =>
  `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ sub: 'u1', tenant }))}.sig`;

function List() {
  const { data } = useSchemas();
  return <ul>{(data ?? []).map((s) => <li key={s.name}>{s.displayName}</li>)}</ul>;
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  tokenStore.set(tokenFor('acme'));
});
afterEach(() => tokenStore.clear());

describe('the type list across a tenant switch', () => {
  it('shows none of the first tenant types once the token changes, before the new list lands', async () => {
    let calls = 0;
    vi.mocked(api.get).mockImplementation((async () => {
      calls += 1;
      if (calls === 1) return { data: { items: [{ name: 'a', displayName: 'Acme type', fields: [] }] } };
      return new Promise(() => undefined);
    }) as typeof api.get);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <List />
      </QueryClientProvider>
    );
    await screen.findByText('Acme type');

    act(() => tokenStore.set(tokenFor('globex')));
    act(() => void client.invalidateQueries());

    await waitFor(() => expect(calls).toBeGreaterThan(1));
    expect(screen.queryByText('Acme type')).not.toBeInTheDocument();
  });
});
