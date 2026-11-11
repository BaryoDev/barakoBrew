import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The rail against barakoCMS 4.7, where GET /api/me says what the caller may do. A custom role
 * granted upload_files gets Files; against an older API the rail is what it was, by role name.
 */
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const nav = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
    usePathname: () => nav.pathname,
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: { userId: 'u1', username: 'r', roles: ['Registrar'] }, logout: vi.fn() }),
}));

vi.mock('@/components/command-menu', () => ({ CommandMenu: () => null }));

const { api } = await import('@/lib/api');
const { AppSidebar } = await import('./app-sidebar');
const { SidebarProvider, SidebarTrigger } = await import('@/components/ui/sidebar');
const { setViewportWidth } = await import('@/test/setup');

const notFound = () =>
    Object.assign(new Error('Request failed with status code 404'), { isAxiosError: true, response: { status: 404 } });

function renderRail(me: { capabilities: string[] } | 'missing', errors = 0, withTrigger = false) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/me') {
            if (me === 'missing') throw notFound();
            return { data: { userId: 'u1', username: 'r', tenant: 'default', roles: [{ id: 'r-1', name: 'Registrar' }], ...me } };
        }
        // Not readable for this caller, so the rail keeps every module item: see withModules.
        if (url === '/api/modules') throw Object.assign(new Error('403'), { isAxiosError: true, response: { status: 403 } });
        if (url.startsWith('/api/client-errors')) return { data: { items: [], totalItems: errors, page: 1, pageSize: 1 } };
        return { data: { items: [], totalItems: 0, page: 1, pageSize: 20 } };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = () => (
        <QueryClientProvider client={client}>
            <SidebarProvider>
                <AppSidebar />
                {withTrigger && <SidebarTrigger />}
            </SidebarProvider>
        </QueryClientProvider>
    );
    const view = render(tree());
    return () => view.rerender(tree());
}

const rail = () => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

beforeEach(() => {
    vi.clearAllMocks();
    nav.pathname = '/';
});

describe('the rail', () => {
    it('offers Files to a custom role granted upload_files', async () => {
        renderRail({ capabilities: ['upload_files'] });

        await waitFor(() => expect(screen.getByRole('link', { name: /^Files/ })).toBeInTheDocument(), { timeout: 5000 });
        expect(rail()).toBeTruthy();
        expect(screen.queryByRole('link', { name: /^Users/ })).toBeNull();
    });

    it('keeps the role-name rule against an API without /api/me', async () => {
        renderRail('missing');

        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
        expect(screen.getByRole('link', { name: /^Overview/ })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /^Files/ })).toBeNull();
    });

    it('folds the Modules group, with its count, and opens it again', async () => {
        renderRail({ capabilities: ['upload_files', 'view_modules'] });
        await waitFor(() => expect(screen.getByRole('link', { name: /^Files/ })).toBeInTheDocument());

        const toggle = screen.getByRole('button', { name: /^Modules/ });
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(toggle.textContent).toMatch(/\d+/);

        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('link', { name: /^Files/ })).toBeNull();

        fireEvent.click(toggle);
        expect(screen.getByRole('link', { name: /^Files/ })).toBeInTheDocument();
    });

    it('shows this console\'s version beside the wordmark, never the API\'s', async () => {
        vi.stubEnv('NEXT_PUBLIC_BREW_VERSION', '1.11.5');
        try {
            renderRail({ capabilities: [] });
            await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
            expect(screen.getByText('barako').textContent).toBe('barakoBrew');
            expect(screen.getByRole('button', { name: /1\.11\.5/ })).toBeInTheDocument();
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it('keeps Sign out and a Dark mode row in the footer', async () => {
        renderRail({ capabilities: [] });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
        expect(screen.getByText(/Sign out/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument();
    });

    it('sets the Modules label at 12px 600 and styles All modules in the accent text', async () => {
        renderRail({ capabilities: ['view_modules'] });
        await waitFor(() => expect(screen.getByRole('link', { name: /^All modules/ })).toBeInTheDocument());

        expect(screen.getByRole('button', { name: /^Modules/ }).className).toMatch(/text-\[12px\].*font-semibold/);
        const all = screen.getByRole('link', { name: /^All modules/ });
        expect(all.className).toContain('text-(--accent-ink)');
        expect(all.className).toContain('font-semibold');
    });

    it('sizes the main nav to 36px rows and the module rows to 34px', async () => {
        renderRail({ capabilities: ['view_modules'] });
        await waitFor(() => expect(screen.getByRole('link', { name: /^All modules/ })).toBeInTheDocument());

        const overview = screen.getByRole('link', { name: /^Overview/ }).className;
        expect(overview).toContain('h-9 text-[14px]');
        expect(overview).toContain('rounded-[9px]');
        expect(overview).toContain('data-[active=true]:font-semibold');
        expect(overview).not.toContain('inset_0_0_0_1px');
        const modules = screen.getByRole('link', { name: /^All modules/ }).className;
        expect(modules).toContain('h-[34px] text-[13.5px]');
    });

    it('draws the main nav as one navigation landmark on a wide screen', async () => {
        renderRail({ capabilities: [] });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
        const landmarks = screen.getAllByRole('navigation');
        expect(landmarks).toHaveLength(1);
        expect(landmarks[0]).toHaveAccessibleName('Main');
        expect(within(landmarks[0]).getByRole('link', { name: /^Overview/ })).toBeInTheDocument();
    });

    it('keeps What\'s new in the rail, beside the version', async () => {
        renderRail({ capabilities: [] });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
        const button = within(rail()).getByRole('button', { name: "What's new" });
        expect(button.className).toContain('size-7');
    });

    it('keeps What\'s new in the drawer too', async () => {
        setViewportWidth(800);
        try {
            renderRail({ capabilities: [] }, 0, true);
            fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
            expect(within(screen.getByRole('dialog')).getByRole('button', { name: "What's new" })).toBeInTheDocument();
        } finally {
            setViewportWidth(1280);
        }
    });

    it('makes Sign out a 44px target below 1000px', async () => {
        renderRail({ capabilities: [] });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
        expect(screen.getByRole('button', { name: /Sign out/ }).className).toContain('max-rail:h-11');
        expect(screen.getByRole('button', { name: 'Dark mode' }).className).toContain('max-rail:h-11');
    });

    it('opens a group folded by hand when the route changes into it', async () => {
        const rerender = renderRail({ capabilities: ['view_audit_log'] });
        await waitFor(() => expect(screen.getByRole('button', { name: /^System/ })).toBeInTheDocument());
        const system = screen.getByRole('button', { name: /^System/ });

        // Folded by default, since nothing in it is open. Open it and fold it by hand.
        expect(system).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(system);
        fireEvent.click(system);
        expect(screen.queryByRole('link', { name: /^Audit log/ })).toBeNull();

        nav.pathname = '/audit';
        rerender();
        await waitFor(() => expect(screen.getByRole('link', { name: /^Audit log/ })).toBeInTheDocument());
    });

    it('opens a folded group on its own when the first screen is inside it', async () => {
        nav.pathname = '/audit';
        renderRail({ capabilities: ['view_audit_log'] });
        await waitFor(() => expect(screen.getByRole('link', { name: /^Audit log/ })).toBeInTheDocument());
    });

    it('flags a folded System group in red with the count, and drops the flag when it is open', async () => {
        renderRail({ capabilities: ['manage_client_errors'] }, 4);
        const system = await screen.findByRole('button', { name: /^System/ });
        const flag = await within(system).findByText(/Needs attention: Errors 4 unresolved/);
        expect(flag.parentElement).toHaveAttribute('title', 'Errors 4 unresolved');
        expect(flag.parentElement).toHaveClass('bg-destructive');

        fireEvent.click(system);
        expect(system).toHaveAttribute('aria-expanded', 'true');
        expect(within(system).queryByText(/Needs attention/)).toBeNull();
    });

    it('shows no flag on a folded System group when nothing is unresolved', async () => {
        renderRail({ capabilities: ['manage_client_errors'] }, 0);
        const system = await screen.findByRole('button', { name: /^System/ });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/client-errors'), expect.anything()));
        expect(within(system).queryByText(/Needs attention/)).toBeNull();
    });
});
