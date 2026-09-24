import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

describe('limiting a key to content types', () => {
    const LISTED = {
        id: 'k1',
        name: 'Changelog push',
        prefix: 'bcms_ab12cd34',
        scopes: ['content:write'],
        tenantSlug: 'default',
        expiresAt: null,
        lastUsedAt: null,
        revoked: false,
        createdAt: new Date().toISOString(),
    };
    const TYPES = [
        { name: 'changelog', displayName: 'Changelog', fields: [] },
        { name: 'contributor', displayName: 'Contributor', fields: [] },
    ];
    const envelope = (items: unknown[]) => ({
        data: { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: 1, hasNextPage: false },
    });

    function serve(keys: unknown[], version = '4.3.0') {
        vi.mocked(api.get).mockReset();
        vi.mocked(api.post).mockReset();
        vi.mocked(api.delete).mockReset();
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/api-keys') return envelope(keys);
            if (url === '/api/content-types') return envelope(TYPES);
            if (url === '/api/meta') return { data: { version, swaggerEnabled: false } };
            throw new Error(`unexpected GET ${url}`);
        });
    }

    async function renderPage() {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(React.createElement(QueryClientProvider, { client }, React.createElement(ApiKeysPage)));
    }

    async function openDialog() {
        fireEvent.click(screen.getAllByRole('button', { name: /new key/i })[0]);
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    }

    it('shows each listed key its content types, and Any for a key with none', async () => {
        serve([
            { ...LISTED, contentTypes: ['changelog', 'contributor'] },
            { ...LISTED, id: 'k2', name: 'Reader', contentTypes: [] },
        ]);
        await renderPage();
        expect(await screen.findByRole('columnheader', { name: 'Content types' })).toBeInTheDocument();
        const rows = screen.getAllByRole('row');
        expect(rows).toHaveLength(3);
        expect(rows[1]).toHaveTextContent('changelog');
        expect(rows[1]).toHaveTextContent('contributor');
        expect(rows[2]).toHaveTextContent('Any');
    });

    it('offers the content types beside the scopes, with the push note', async () => {
        serve([{ ...LISTED, contentTypes: [] }]);
        await renderPage();
        await screen.findByText('Changelog push');
        await openDialog();

        const group = await screen.findByRole('group', { name: 'Content types' });
        expect(await within(group).findByLabelText('Changelog')).toBeInTheDocument();
        expect(within(group).getByLabelText('Contributor')).toBeInTheDocument();
        expect(group).toHaveTextContent('A key limited to types can only use POST /api/collections/{type}/push');
    });

    it('sends the chosen types when minting', async () => {
        serve([{ ...LISTED, contentTypes: [] }]);
        vi.mocked(api.post).mockResolvedValue({
            data: { ...LISTED, id: 'new', name: 'Push', contentTypes: ['changelog'], key: 'bcms_SECRET' },
        });
        await renderPage();
        await screen.findByText('Changelog push');
        await openDialog();

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Push' } });
        fireEvent.click(document.getElementById('scope-content:write') as HTMLElement);
        fireEvent.click(await screen.findByLabelText('Changelog'));
        fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

        await waitFor(() => expect(screen.getByTestId('api-key-secret')).toHaveValue('bcms_SECRET'));
        expect(api.post).toHaveBeenCalledWith('/api/api-keys', {
            name: 'Push',
            scopes: ['content:read', 'content:write'],
            expiresAt: undefined,
            contentTypes: ['changelog'],
        });
    });

    it('mints a key with no type chosen exactly as before, with no contentTypes in the body', async () => {
        serve([{ ...LISTED, contentTypes: [] }]);
        vi.mocked(api.post).mockResolvedValue({
            data: { ...LISTED, id: 'new', name: 'Plain', contentTypes: [], key: 'bcms_SECRET' },
        });
        await renderPage();
        await screen.findByText('Changelog push');
        await openDialog();

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Plain' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

        await waitFor(() => expect(screen.getByTestId('api-key-secret')).toHaveValue('bcms_SECRET'));
        const body = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>;
        expect(Object.keys(body).sort()).toEqual(['expiresAt', 'name', 'scopes']);
    });

    it('offers the types on an empty list when the API version has them', async () => {
        serve([], '4.4.0');
        await renderPage();
        await screen.findByText('No API keys yet');
        await openDialog();
        expect(await screen.findByRole('group', { name: 'Content types' })).toBeInTheDocument();
    });

    it('hides the control and the column against an API that does not return contentTypes', async () => {
        serve([LISTED], '4.3.0');
        await renderPage();
        await screen.findByText('Changelog push');
        await openDialog();

        expect(screen.getByLabelText('Name')).toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Content types' })).toBeNull();
        expect(screen.queryByRole('columnheader', { name: 'Content types' })).toBeNull();
        expect(api.get).not.toHaveBeenCalledWith('/api/content-types');
    });

    it('revokes a key the API minted without the chosen types, rather than handing it out', async () => {
        serve([], '4.4.0');
        vi.mocked(api.post).mockResolvedValue({
            data: { ...LISTED, id: 'minted', name: 'Push', key: 'bcms_UNLIMITED' },
        });
        vi.mocked(api.delete).mockResolvedValue({});
        await renderPage();
        await screen.findByText('No API keys yet');
        await openDialog();

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Push' } });
        fireEvent.click(await screen.findByLabelText('Changelog'));
        fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/api-keys/minted'));
        expect(screen.queryByTestId('api-key-secret')).toBeNull();
        expect(document.body.textContent).not.toContain('bcms_UNLIMITED');
    });
});
