import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const session = vi.hoisted(() => ({
    user: { userId: 'me', username: 'me', roles: [] as string[] },
}));

vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: session.user, isAuthenticated: true, isLoading: false, logout: vi.fn(), requireAuth: vi.fn() }),
}));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { toast } = await import('sonner');
const { api } = await import('@/lib/api');
const { default: UsersPage } = await import('./page');

const EDITOR = { id: 'r-editor', name: 'Editor', permissions: [], systemCapabilities: [] };
const AUTHOR = { id: 'r-author', name: 'Author', permissions: [], systemCapabilities: [] };
const GROUP = { id: 'g-1', name: 'Reviewers' };

const page = <T,>(items: T[]) => ({
    data: { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: 1, hasNextPage: false },
});

function rejection(status: number, data: unknown) {
    return new AxiosError('failed', String(status), undefined, undefined, {
        status,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data,
    });
}

async function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(React.createElement(QueryClientProvider, { client }, React.createElement(UsersPage)));
    await waitFor(() => expect(screen.getByText('ana')).toBeInTheDocument());
}

beforeEach(() => {
    vi.mocked(toast.error).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/users') {
            return page([{ id: 'u-ana', username: 'ana', email: 'ana@example.com', roleIds: [EDITOR.id], groupIds: [], createdAt: '2026-01-01T00:00:00Z' }]);
        }
        if (url === '/api/roles') return page([EDITOR, AUTHOR]);
        if (url === '/api/user-groups') return page([GROUP]);
        throw new Error(`unexpected GET ${url}`);
    });
});

/**
 * `/api/users/{id}/roles` changes the roles a user holds in every tenant. From API contract 5 the
 * server refuses it when the caller's capability comes only from a tenant membership. The token
 * carries effective roles, so a global Admin and a tenant Admin look the same here: the controls
 * stay, the API decides, and the toast says where a tenant Admin should go instead.
 */
describe('global role controls on the Users screen', () => {
    it('are offered to a SuperAdmin', async () => {
        session.user.roles = ['SuperAdmin'];
        await renderPage();

        expect(screen.getByRole('button', { name: 'Remove role Editor from ana' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add role to ana' })).toBeInTheDocument();
    });

    it('are offered to an Admin, since a global Admin may still use them', async () => {
        session.user.roles = ['Admin'];
        await renderPage();

        expect(screen.getByRole('button', { name: 'Remove role Editor from ana' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add role to ana' })).toBeInTheDocument();
    });
});

describe('when the API refuses a role change', () => {
    beforeEach(() => {
        session.user.roles = ['SuperAdmin'];
    });

    it('shows the message the API sent', async () => {
        vi.mocked(api.delete).mockRejectedValue(
            rejection(409, { message: 'Cannot remove the last SuperAdmin. Grant SuperAdmin to another user first.' }),
        );
        await renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Remove role Editor from ana' }));

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
                'Cannot remove the last SuperAdmin. Grant SuperAdmin to another user first.',
            ),
        );
    });

    it('shows the detail of a problem body', async () => {
        vi.mocked(api.delete).mockRejectedValue(
            rejection(403, { status: 403, title: 'Forbidden', detail: 'Only a platform administrator can change global roles.' }),
        );
        await renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Remove role Editor from ana' }));

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('Only a platform administrator can change global roles.'),
        );
    });

    it('explains a bare 403 instead of a generic refusal', async () => {
        vi.mocked(api.delete).mockRejectedValue(rejection(403, ''));
        await renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Remove role Editor from ana' }));

        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
        const message = vi.mocked(toast.error).mock.calls[0][0] as string;
        expect(message).toMatch(/only a platform administrator/i);
        expect(message).toMatch(/members on the Tenants screen/i);
    });
});
