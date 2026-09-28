import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
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

const { api } = await import('@/lib/api');
const { default: TenantsPage } = await import('./page');

const page = <T,>(items: T[]) => ({
    data: { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: 1, hasNextPage: false },
});

const MEMBER = { userId: 'u-1', username: 'ana', email: 'ana@example.com', roleIds: [], status: 'Active', joinedAt: '2026-01-01T00:00:00Z' };
const TENANT = { id: 't-1', slug: 'north', name: 'North club', domains: [], isActive: true };

async function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(React.createElement(QueryClientProvider, { client }, React.createElement(TenantsPage)));
    await waitFor(() => expect(screen.getByText('ana@example.com')).toBeInTheDocument());
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/tenants') {
            // The server answers this for SuperAdmin only.
            if (!session.user.roles.includes('SuperAdmin')) throw Object.assign(new Error('403'), { response: { status: 403 } });
            return page([TENANT]);
        }
        if (url === '/api/tenants/members') return page([MEMBER]);
        if (url === '/api/tenants/members/roles') return page([]);
        throw new Error(`unexpected GET ${url}`);
    });
});

/**
 * GET /api/tenants and creating a tenant are SuperAdmin acts. The members list is for any Admin of
 * the tenant, and it is where a tenant Admin gives roles, so the screen has to be usable for one.
 */
describe('the Tenants screen', () => {
    it('shows a SuperAdmin every tenant and the New tenant button', async () => {
        session.user.roles = ['SuperAdmin'];
        await renderPage();

        await waitFor(() => expect(screen.getByText('North club')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /new tenant/i })).toBeInTheDocument();
    });

    it('shows a tenant Admin only the members of their tenant', async () => {
        session.user.roles = ['Admin'];
        await renderPage();

        expect(screen.getByText('Members of this tenant')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /new tenant/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/load tenants/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
        expect(vi.mocked(api.get).mock.calls.map((c) => c[0])).not.toContain('/api/tenants');
    });
});
