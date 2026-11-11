import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar, SidebarContent, SidebarProvider } from '@/components/ui/sidebar';
import { setViewportWidth } from '@/test/setup';

const nav = vi.hoisted(() => ({ pathname: '/workflow-runs' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-tenants', () => ({
    useCurrentTenant: () => 'cafe',
    useMyTenants: () => ({ data: [{ slug: 'cafe', name: 'Kape Cafe' }] }),
}));
vi.mock('@/hooks/use-meta', () => ({ useApiMeta: () => ({ data: undefined }), brewVersion: () => null, adminVersion: () => null }));

const { AppHeader } = await import('./app-header');

const renderHeader = () => render(<SidebarProvider><AppHeader /></SidebarProvider>);

const renderWithDrawer = () =>
    render(
        <SidebarProvider>
            <Sidebar>
                <SidebarContent>
                    <a href="/one">One</a>
                </SidebarContent>
            </Sidebar>
            <AppHeader />
        </SidebarProvider>,
    );

beforeEach(() => {
    nav.pathname = '/workflow-runs';
});

describe('the top bar below 1000px', () => {
    it('shows the wordmark, the tenant and screen, and a 44px search button', () => {
        setViewportWidth(800);
        renderHeader();
        expect(screen.getByText('barako').textContent).toBe('barakoBrew');
        expect(screen.getByLabelText('Where you are')).toHaveTextContent('Kape Cafe/Workflow runs');
        const search = screen.getByRole('button', { name: 'Search' });
        expect(search.className).toContain('size-11');
        expect(screen.getByRole('button', { name: /sidebar/i }).className).toContain('max-rail:size-11');
    });

    it('puts the menu glyph and the command text in the two 44px buttons', () => {
        setViewportWidth(800);
        renderHeader();
        expect(screen.getByRole('button', { name: /sidebar/i })).toHaveTextContent('☰');
        expect(screen.getByRole('button', { name: 'Search' })).toHaveTextContent('⌘K');
    });

    it('names a deeper screen in the breadcrumb, tenant first', () => {
        setViewportWidth(800);
        nav.pathname = '/site/theme';
        renderHeader();
        expect(screen.getByLabelText('Where you are')).toHaveTextContent('Kape Cafe/Theme');
    });

    it('opens the drawer from the menu button and closes it on Escape', () => {
        setViewportWidth(800);
        renderWithDrawer();
        expect(screen.queryByRole('dialog')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /sidebar/i }));
        const drawer = screen.getByRole('dialog');
        expect(drawer.style.getPropertyValue('--sidebar-width')).toBe('236px');
        expect(drawer.className).toContain('drawer-in_.3s_cubic-bezier(.2,.8,.2,1)');
        expect(screen.getByRole('link', { name: 'One' })).toBeInTheDocument();

        fireEvent.keyDown(drawer, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes the drawer when the scrim is tapped', async () => {
        setViewportWidth(800);
        renderWithDrawer();
        fireEvent.click(screen.getByRole('button', { name: /sidebar/i }));
        const scrim = document.querySelector('[data-slot="sheet-overlay"]') as HTMLElement;
        expect(scrim.className).toContain('--scrim');

        // A modal Radix dialog arms dismissal on pointerdown and closes on the click that
        // follows (deferPointerDownOutside), so tap the scrim the way a browser does.
        await userEvent.setup().click(scrim);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('has no top bar on a wide screen at a top-level screen', () => {
        setViewportWidth(1280);
        const view = renderHeader();
        expect(screen.queryByLabelText('Where you are')).toBeNull();
        expect(view.container.querySelector('header')).toBeNull();
        expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    });

    it('keeps a breadcrumb line on a wide screen below a top-level screen', () => {
        setViewportWidth(1280);
        nav.pathname = '/site/theme';
        renderHeader();
        expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toHaveTextContent('OverviewSite settingsTheme');
    });
});
