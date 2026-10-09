import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The rail against barakoCMS 4.7, where GET /api/me says what the caller may do. A custom role
 * granted upload_files gets Files; against an older API the rail is what it was, by role name.
 */
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: { userId: 'u1', username: 'r', roles: ['Registrar'] }, logout: vi.fn() }),
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/command-menu', () => ({ CommandMenu: () => null }));

const { api } = await import('@/lib/api');
const { AppSidebar } = await import('./app-sidebar');
const { SidebarProvider } = await import('@/components/ui/sidebar');

const notFound = () =>
    Object.assign(new Error('Request failed with status code 404'), { isAxiosError: true, response: { status: 404 } });

function renderRail(me: { capabilities: string[] } | 'missing') {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/me') {
            if (me === 'missing') throw notFound();
            return { data: { userId: 'u1', username: 'r', tenant: 'default', roles: [{ id: 'r-1', name: 'Registrar' }], ...me } };
        }
        // Not readable for this caller, so the rail keeps every module item: see withModules.
        if (url === '/api/modules') throw Object.assign(new Error('403'), { isAxiosError: true, response: { status: 403 } });
        return { data: { items: [], totalItems: 0, page: 1, pageSize: 20 } };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <SidebarProvider>
                <AppSidebar />
            </SidebarProvider>
        </QueryClientProvider>,
    );
}

const rail = () => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

beforeEach(() => {
    vi.clearAllMocks();
});

describe('the rail', () => {
    it('offers Files to a custom role granted upload_files', async () => {
        renderRail({ capabilities: ['upload_files'] });

        await waitFor(() => expect(screen.getByRole('link', { name: /^Files/ })).toBeInTheDocument());
        expect(rail()).toBeTruthy();
        expect(screen.queryByRole('link', { name: /^Users/ })).toBeNull();
    });

    it('keeps the role-name rule against an API without /api/me', async () => {
        renderRail('missing');

        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
        expect(screen.getByRole('link', { name: /^Overview/ })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /^Files/ })).toBeNull();
    });
});
