import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({
        user: { userId: 'me', username: 'me', roles: ['Editor'] },
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
const { default: RolesPage } = await import('./page');
const { default: EditRolePage } = await import('./[id]/page');

/** A role list as contract 8 sends it: Admin is a platform role, Editor is the tenant's own. */
const ADMIN = {
    id: 'r-admin',
    name: 'Admin',
    permissions: [],
    systemCapabilities: [],
    isSystem: false,
    isPlatform: true,
    tenantSlug: null,
};
const EDITOR = { ...ADMIN, id: 'r-editor', name: 'Editor', isPlatform: false, tenantSlug: 'default' };

const page = <T,>(items: T[]) => ({
    data: { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: 1, hasNextPage: false },
});

function callerHolds(capabilities: string[]) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/me') {
            return { data: { userId: 'me', username: 'me', tenant: 'default', roles: [{ id: 'r-editor', name: 'Editor' }], capabilities } };
        }
        if (url === '/api/roles') return page([ADMIN, EDITOR]);
        if (url === `/api/roles/${ADMIN.id}`) return { data: ADMIN };
        if (url === '/api/content-types') return page([]);
        throw new Error(`unexpected GET ${url}`);
    });
}

function renderPage(element: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <React.Suspense fallback={null}>{element}</React.Suspense>
        </QueryClientProvider>,
    );
}

/** The capabilities the caller holds have been read, so the screen decides by them, not by role names. */
async function accessKnown() {
    await waitFor(() => expect(vi.mocked(api.get).mock.calls.some(([url]) => url === '/api/me')).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function editRole() {
    const params = Object.assign(Promise.resolve({ id: ADMIN.id }), { status: 'fulfilled' as const, value: { id: ADMIN.id } });
    renderPage(<EditRolePage params={params} />);
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
});

describe('the Roles list against contract 8', () => {
    it('offers no delete on a platform role to a caller without manage_platform_roles', async () => {
        callerHolds(['manage_roles']);
        renderPage(<RolesPage />);
        await screen.findByText('Editor');
        await accessKnown();

        expect(screen.queryByRole('button', { name: 'Delete Admin' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete Editor' })).toBeInTheDocument();
    });

    it('offers it to a caller holding manage_platform_roles', async () => {
        callerHolds(['manage_roles', 'manage_platform_roles']);
        renderPage(<RolesPage />);
        await screen.findByText('Editor');

        expect(await screen.findByRole('button', { name: 'Delete Admin' })).toBeInTheDocument();
    });
});

describe('editing a platform role against contract 8', () => {
    it('says why and offers no save to a caller without manage_platform_roles', async () => {
        callerHolds(['manage_roles']);
        editRole();

        expect(await screen.findByRole('note')).toHaveTextContent('platform role');
        expect(screen.getByRole('button', { name: 'Save role' })).toBeDisabled();
    });

    it('offers the save to a caller holding manage_platform_roles', async () => {
        callerHolds(['manage_roles', 'manage_platform_roles']);
        editRole();

        await screen.findByRole('button', { name: 'Save role' });
        await accessKnown();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save role' })).toBeEnabled());
        expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });
});
