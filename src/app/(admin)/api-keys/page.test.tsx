import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { API_KEY_SCOPES } = await import('@/hooks/use-api-keys');
const { default: ApiKeysPage } = await import('./page');

// Copied from ApiKeyScopes.Known in barakoCMS/Models/ApiKey.cs. A scope the backend adds and the
// console does not offer can only be reached through `*`.
const BACKEND_SCOPES = ['*', 'content:read', 'content:write', 'content:destructive', 'contenttype:read', 'contenttype:write'];

describe('API key scopes', () => {
    it('offers exactly the scopes the backend knows', () => {
        const offered = API_KEY_SCOPES.map((s) => s.value);
        expect(offered).toHaveLength(BACKEND_SCOPES.length);
        expect([...offered].sort()).toEqual([...BACKEND_SCOPES].sort());
    });

    it('says content:write does not cover erase or rollback', () => {
        const write = API_KEY_SCOPES.find((s) => s.value === 'content:write');
        expect(write?.description).toBe('Create, update and delete entries (not erase or rollback)');
        const destructive = API_KEY_SCOPES.find((s) => s.value === 'content:destructive');
        expect(destructive?.description).toBe('Erase entries permanently and roll back versions');
    });
});

describe('the new key dialog', () => {
    beforeEach(() => {
        vi.mocked(api.get).mockReset();
        vi.mocked(api.get).mockResolvedValue({
            data: { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNextPage: false },
        });
    });

    async function openDialog() {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(React.createElement(QueryClientProvider, { client }, React.createElement(ApiKeysPage)));
        await waitFor(() => expect(screen.getByText('No API keys yet')).toBeInTheDocument());
        fireEvent.click(screen.getAllByRole('button', { name: /new key/i })[0]);
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    }

    const checkbox = (scope: string) => {
        const box = document.getElementById(`scope-${scope}`);
        expect(box).not.toBeNull();
        return box as HTMLElement;
    };
    const warning = () => screen.queryByText(/can erase entries and roll back versions/i);

    it('warns when the destructive scope is selected, and not otherwise', async () => {
        await openDialog();
        expect(warning()).toBeNull();

        fireEvent.click(checkbox('content:write'));
        expect(warning()).toBeNull();

        fireEvent.click(checkbox('content:destructive'));
        expect(warning()).toBeInTheDocument();
        expect(warning()).toHaveAttribute('role', 'alert');

        fireEvent.click(checkbox('content:destructive'));
        expect(warning()).toBeNull();
    });

    it('warns for full content access too, since * includes the destructive scope', async () => {
        await openDialog();
        fireEvent.click(checkbox('*'));
        expect(warning()).toBeInTheDocument();

        fireEvent.click(checkbox('*'));
        expect(warning()).toBeNull();
    });
});

describe('the created key', () => {
  const SECRET = 'bcms_THEFULLSECRETVALUE123456';
  const CREATED = {
    id: 'new',
    name: 'My key',
    prefix: 'bcms_ab12cd34',
    scopes: ['content:read'],
    tenantSlug: 'default',
    expiresAt: null,
    lastUsedAt: null,
    revoked: false,
    createdAt: new Date().toISOString(),
    key: SECRET,
  };

  function anywhereInTheCaches(client: QueryClient) {
    const holds = (value: unknown) => JSON.stringify(value ?? null).includes(SECRET);
    return (
      client.getMutationCache().getAll().some((m) => holds(m.state.data)) ||
      client.getQueryCache().getAll().some((q) => holds(q.state.data))
    );
  }

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.get).mockResolvedValue({
      data: { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNextPage: false },
    });
    vi.mocked(api.post).mockResolvedValue({ data: CREATED });
  });

  async function create() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(React.createElement(QueryClientProvider, { client }, React.createElement(ApiKeysPage)));
    await waitFor(() => expect(screen.getByText('No API keys yet')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /new key/i })[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    await waitFor(() => expect(screen.getByTestId('api-key-secret')).toHaveValue(SECRET));
    return client;
  }

  it('is shown once, and is out of the caches before the dialog is even closed', async () => {
    const client = await create();

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(anywhereInTheCaches(client)).toBe(false);
  });

  it('is not in the mutation cache after the dialog closes', async () => {
    const client = await create();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByTestId('api-key-secret')).toBeNull());

    expect(client.getMutationCache().getAll().some((m) => JSON.stringify(m.state.data ?? null).includes(SECRET))).toBe(
      false,
    );
    expect(anywhereInTheCaches(client)).toBe(false);
    expect(document.body.textContent).not.toContain(SECRET);
  });
});
