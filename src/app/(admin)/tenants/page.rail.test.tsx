import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({
        user: { userId: 'me', username: 'me', roles: ['SuperAdmin'] },
        isAuthenticated: true,
        isLoading: false,
        logout: vi.fn(),
        requireAuth: vi.fn(),
    }),
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

const TENANT = {
    id: 't-1',
    slug: 'north',
    name: 'North club',
    domains: ['north.example'],
    isActive: true,
    status: 'Active',
};

async function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(React.createElement(QueryClientProvider, { client }, React.createElement(TenantsPage)));
    await waitFor(() => expect(screen.getByText('North club')).toBeInTheDocument());
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/tenants') return page([TENANT]);
        if (url === '/api/tenants/members') return page([]);
        if (url === '/api/tenants/members/roles') return page([]);
        throw new Error(`unexpected GET ${url}`);
    });
});

describe('the tenant edit rail', () => {
    it('opens from a row and saves a status change with the request body', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { ...TENANT, status: 'Suspended', isActive: false } });
        await renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'North club' }));
        const rail = await screen.findByRole('dialog');
        expect(within(rail).getByText('PUT /api/tenants/north')).toBeInTheDocument();
        expect(within(rail).getByRole('button', { name: 'Save changes' })).toBeInTheDocument();

        fireEvent.click(within(rail).getByRole('radio', { name: /suspended/i }));
        fireEvent.click(within(rail).getByRole('button', { name: 'Save and suspend' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0]).toEqual([
            '/api/tenants/north',
            { Handle: 'north', Name: 'North club', Status: 'Suspended', Domains: ['north.example'] },
        ]);
    });

    it('states what Suspended does to delivery and to its own callers', async () => {
        await renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'North club' }));
        const rail = await screen.findByRole('dialog');

        expect(within(rail).getAllByRole('radio')).toHaveLength(3);
        expect(within(rail).getByText(/answers 404 on delivery and 403 to its own signed-in callers\. reversible/i)).toBeInTheDocument();
    });

    it('adds and removes a domain in the saved body', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: TENANT });
        await renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'North club' }));
        const rail = await screen.findByRole('dialog');
        fireEvent.change(within(rail).getByLabelText('Domains'), { target: { value: 'club.example' } });
        fireEvent.click(within(rail).getByRole('button', { name: 'Add domain' }));
        fireEvent.click(within(rail).getByRole('button', { name: 'Remove north.example' }));
        fireEvent.click(within(rail).getByRole('button', { name: 'Save changes' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({
            Handle: 'north',
            Name: 'North club',
            Status: 'Active',
            Domains: ['club.example'],
        });
    });

    it('sends the flag, not a status, to an API that reports only the flag', async () => {
        const legacy = { id: 't-1', slug: 'north', name: 'North club', isActive: true };
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/tenants') return page([legacy]);
            return page([]);
        });
        vi.mocked(api.put).mockResolvedValue({ data: legacy });
        await renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'North club' }));
        const rail = await screen.findByRole('dialog');
        expect(within(rail).getAllByRole('radio')).toHaveLength(2);
        fireEvent.click(within(rail).getByRole('radio', { name: /suspended/i }));
        fireEvent.click(within(rail).getByRole('button', { name: 'Save and suspend' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.put).mock.calls[0][1]).toEqual({ Handle: 'north', Name: 'North club', IsActive: false });
    });

    it('opens New tenant in the rail with the POST line, not a modal form', async () => {
        await renderPage();

        fireEvent.click(screen.getByRole('button', { name: /new tenant/i }));
        const rail = await screen.findByRole('dialog');
        expect(within(rail).getByText('POST /api/tenants')).toBeInTheDocument();
        expect(rail.getAttribute('data-slot')).toBe('sheet-content');
    });
});
