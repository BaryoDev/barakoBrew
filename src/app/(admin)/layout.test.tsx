import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let authenticated = false;
vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ isAuthenticated: authenticated, isLoading: false, requireAuth: vi.fn() }),
}));
vi.mock('@/components/sign-in/remember-instance', () => ({ RememberInstance: () => <i data-testid="remember" /> }));
vi.mock('@/components/app-sidebar', () => ({ AppSidebar: () => null }));
vi.mock('@/components/app-header', () => ({ AppHeader: () => null }));
vi.mock('@/components/crumb-title', () => ({ CrumbTitleProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/ui/sidebar', () => ({
    SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SidebarInset: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/uploads-provider', () => ({ UploadsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/upload-tray', () => ({ UploadTray: () => null }));

const { default: AdminLayout } = await import('./layout');

describe('the admin layout and the remembered instance', () => {
    it('records the instance only inside a signed-in session', () => {
        authenticated = true;
        const { unmount } = render(<AdminLayout>page</AdminLayout>);
        expect(screen.getByTestId('remember')).toBeInTheDocument();
        unmount();
    });

    it('does not render the recorder when nobody is signed in', () => {
        authenticated = false;
        render(<AdminLayout>page</AdminLayout>);
        expect(screen.queryByTestId('remember')).toBeNull();
    });
});
