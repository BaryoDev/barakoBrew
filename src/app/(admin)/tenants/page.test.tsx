import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

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
const TENANT = {
    id: 't-1',
    slug: 'north',
    name: 'North club',
    domains: ['north.example'],
    domainStates: [{ domain: 'north.example', status: 'Pending', txtName: '_brew.north.example', txtValue: 'abc' }],
    status: 'Active',
    isActive: true,
    signUp: 'InviteOnly',
    memberCount: 12,
    siteMode: 'Live',
};
const BARE_TENANT = { id: 't-2', slug: 'bare', name: 'Bare club', domains: [], isActive: true, memberCount: null, siteMode: null };

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

    // API 4.6 moved the profile to the site entry and answers a create carrying About with 400.
    it('creates a tenant in the rail without a profile field, since the profile lives on the site entry', async () => {
        session.user.roles = ['SuperAdmin'];
        vi.mocked(api.post).mockResolvedValue({ data: { ...TENANT, slug: 'south', name: 'South club' } });
        await renderPage();

        fireEvent.click(screen.getByRole('button', { name: /new tenant/i }));
        expect(screen.getByRole('dialog', { name: 'New tenant' })).toBeInTheDocument();
        expect(screen.queryByLabelText(/about/i)).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'South club' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create tenant' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.post).mock.calls[0]).toEqual([
            '/api/tenants',
            { Handle: 'south-club', Name: 'South club', Status: 'Active', Domains: [] },
        ]);
    });

    it('opens the tenant in a rail when its row is clicked', async () => {
        session.user.roles = ['SuperAdmin'];
        await renderPage();
        await waitFor(() => expect(screen.getByText('North club')).toBeInTheDocument());
        expect(screen.queryByRole('dialog', { name: 'North club' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('north.example'));

        const rail = await screen.findByRole('dialog', { name: 'North club' });
        expect(within(rail).getByText('PUT /api/tenants/north')).toBeInTheDocument();
        expect(within(rail).getByText('Pending')).toBeInTheDocument();
    });

    it('names the suspend in the Save button and sends only accepted fields', async () => {
        session.user.roles = ['SuperAdmin'];
        vi.mocked(api.put).mockResolvedValue({ data: TENANT });
        await renderPage();
        await waitFor(() => expect(screen.getByText('North club')).toBeInTheDocument());
        fireEvent.click(screen.getByText('north.example'));
        const rail = await screen.findByRole('dialog', { name: 'North club' });

        expect(within(rail).getByRole('button', { name: 'Save' })).toBeInTheDocument();
        fireEvent.click(within(rail).getByLabelText(/^Suspended/));
        fireEvent.click(within(rail).getByRole('button', { name: 'Save and suspend' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0]).toEqual([
            '/api/tenants/north',
            { Name: 'North club', Status: 'Suspended', SignUp: 'InviteOnly', Domains: ['north.example'] },
        ]);
    });

    async function openNorth() {
        session.user.roles = ['SuperAdmin'];
        await renderPage();
        await waitFor(() => expect(screen.getByText('North club')).toBeInTheDocument());
        fireEvent.click(screen.getByText('north.example'));
        return screen.findByRole('dialog', { name: 'North club' });
    }

    it('shows Verified in the open rail once the refreshed list says so', async () => {
        let verified = false;
        const fallback = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation(async (url: string, ...rest: unknown[]) => {
            if (url === '/api/tenants') {
                return page([
                    verified
                        ? { ...TENANT, domainStates: [{ domain: 'north.example', status: 'Verified' }] }
                        : TENANT,
                ]);
            }
            return (fallback as (u: string, ...r: unknown[]) => unknown)(url, ...rest);
        });
        vi.mocked(api.post).mockImplementation(async () => {
            verified = true;
            return { data: { domain: 'north.example', status: 'Verified' } };
        });
        const rail = await openNorth();

        fireEvent.click(within(rail).getByRole('button', { name: /^Verify/ }));

        await waitFor(() => expect(within(rail).getByText('Verified')).toBeInTheDocument());
        expect(within(rail).queryByText('Pending')).not.toBeInTheDocument();
        expect(within(rail).queryByRole('button', { name: /^Verify/ })).not.toBeInTheDocument();
    });

    it('reads the tenants list again when the rail opens', async () => {
        const rail = await openNorth();
        expect(rail).toBeInTheDocument();
        const before = vi.mocked(api.get).mock.calls.filter((c) => c[0] === '/api/tenants').length;
        fireEvent.click(within(rail).getByRole('button', { name: 'Cancel' }));
        fireEvent.click(screen.getByText('north.example'));
        await waitFor(() =>
            expect(vi.mocked(api.get).mock.calls.filter((c) => c[0] === '/api/tenants').length).toBeGreaterThan(before),
        );
    });

    it('says the lookup timed out instead of calling it pending', async () => {
        const { toast } = await import('sonner');
        vi.mocked(api.post).mockResolvedValue({ data: { domain: 'north.example', status: 'Pending', timedOut: true } });
        const rail = await openNorth();

        fireEvent.click(within(rail).getByRole('button', { name: /^Verify/ }));

        await waitFor(() => expect(toast.message).toHaveBeenCalledWith(expect.stringContaining('timed out')));
        expect(toast.message).not.toHaveBeenCalledWith(expect.stringContaining('still pending'));
    });

    it('refuses a reserved handle on a new tenant and says why', async () => {
        session.user.roles = ['SuperAdmin'];
        await renderPage();
        fireEvent.click(screen.getByRole('button', { name: /new tenant/i }));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Admin' } });
        fireEvent.change(screen.getByLabelText('Handle'), { target: { value: 'admin' } });

        expect(screen.getByText('That handle is reserved.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create tenant' })).toBeDisabled();
    });

    it('does not say the sign-up is unreported on a new tenant', async () => {
        session.user.roles = ['SuperAdmin'];
        await renderPage();
        fireEvent.click(screen.getByRole('button', { name: /new tenant/i }));

        expect(screen.queryByText('Not reported by this API.')).not.toBeInTheDocument();
        expect(screen.getByText(/Registration creates an account with no membership/)).toBeInTheDocument();
    });

    it('keeps Save plain when a Suspended tenant is only renamed, and red when the status changes', async () => {
        session.user.roles = ['SuperAdmin'];
        const fallback = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation(async (url: string, ...rest: unknown[]) => {
            if (url === '/api/tenants') return page([{ ...TENANT, status: 'Suspended', isActive: false }]);
            return (fallback as (u: string, ...r: unknown[]) => unknown)(url, ...rest);
        });
        await renderPage();
        fireEvent.click(await screen.findByText('north.example'));
        const rail = await screen.findByRole('dialog', { name: 'North club' });

        fireEvent.change(within(rail).getByLabelText('Name'), { target: { value: 'North club 2' } });
        expect(within(rail).getByRole('button', { name: 'Save' })).toHaveAttribute('data-variant', 'default');

        fireEvent.click(within(rail).getByLabelText(/^Archived/));
        expect(within(rail).getByRole('button', { name: 'Save and archive' })).toHaveAttribute('data-variant', 'destructive');
    });

    it('shows a dash, not null, for a member count and site mode the API did not report', async () => {
        session.user.roles = ['SuperAdmin'];
        const fallback = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation(async (url: string, ...rest: unknown[]) => {
            if (url === '/api/tenants') return page([BARE_TENANT]);
            return (fallback as (u: string, ...r: unknown[]) => unknown)(url, ...rest);
        });
        await renderPage();

        const row = (await screen.findByText('Bare club')).closest('tr')!;
        expect(row).not.toHaveTextContent('null');
        expect(within(row).getAllByText('\u2013').length).toBeGreaterThanOrEqual(2);
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

    it('shows a custom role holding manage_tenants every tenant, as the API serves it', async () => {
        session.user.roles = ['Platform'];
        const fallback = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation(async (url: string, ...rest: unknown[]) => {
            if (url === '/api/me') {
                return {
                    data: {
                        userId: 'me',
                        username: 'me',
                        tenant: 'default',
                        roles: [{ id: 'r-7', name: 'Platform' }],
                        capabilities: ['manage_tenant_members', 'manage_tenants'],
                    },
                };
            }
            if (url === '/api/tenants') return page([TENANT]);
            return (fallback as (u: string, ...r: unknown[]) => unknown)(url, ...rest);
        });
        await renderPage();

        await waitFor(() => expect(screen.getByText('North club')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /new tenant/i })).toBeInTheDocument();
    });
});
