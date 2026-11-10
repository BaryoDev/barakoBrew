import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { setViewportWidth } from '@/test/setup';

vi.mock('next/navigation', () => ({ usePathname: () => '/workflow-runs', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-tenants', () => ({
    useCurrentTenant: () => 'cafe',
    useMyTenants: () => ({ data: [{ slug: 'cafe', name: 'Kape Cafe' }] }),
}));
vi.mock('@/hooks/use-meta', () => ({ useApiMeta: () => ({ data: undefined }), brewVersion: () => null, adminVersion: () => null }));

const { AppHeader } = await import('./app-header');

const renderHeader = () => render(<SidebarProvider><AppHeader /></SidebarProvider>);

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

    it('keeps the breadcrumb header on a wide screen', () => {
        setViewportWidth(1280);
        renderHeader();
        expect(screen.queryByLabelText('Where you are')).toBeNull();
        expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
    });
});
