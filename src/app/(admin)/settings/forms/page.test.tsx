import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), put: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { toast } = await import('sonner');
const { default: FormsSettingsPage } = await import('./page');

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 100, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false });

const TYPES = [
    {
        name: 'signup',
        displayName: 'Sign-up',
        fields: [
            { name: 'Name', displayName: 'Name', type: 'string', isRequired: true },
            { name: 'Email', displayName: 'Email', type: 'email', isRequired: true, sensitivity: 'Public' },
            { name: 'Backup', displayName: 'Backup', type: 'email', isRequired: false, sensitivity: 'Hidden' },
        ],
    },
    { name: 'note', displayName: 'Note', fields: [{ name: 'Body', displayName: 'Body', type: 'text', isRequired: false }] },
    { name: 'site', displayName: 'Site', isSingleton: true, fields: [] },
];

function notFound() {
    return new AxiosError('nf', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 404, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() },
    });
}

function renderWith(forms: unknown[] | 'absent') {
    vi.mocked(api.get).mockImplementation((async (url: string) => {
        if (url === '/api/content-types') return { data: page(TYPES) };
        if (url === '/api/forms') {
            if (forms === 'absent') throw notFound();
            return { data: page(forms) };
        }
        throw new Error(`unexpected GET ${url}`);
    }) as typeof api.get);
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <FormsSettingsPage />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(toast.warning).mockReset();
});

describe('the forms screen', () => {
    it('lists every type that can be a form, with the ones that are switched on', async () => {
        renderWith([{ contentType: 'signup', enabled: true, enabledAt: '2026-10-01T00:00:00Z', verifyEmailField: null }]);

        const signup = await screen.findByRole('switch', { name: 'Sign-up accepts submissions' });
        expect(signup).toBeChecked();
        expect(screen.getByRole('switch', { name: 'Note accepts submissions' })).not.toBeChecked();
        // A single-entry type is refused as a form, so it is not offered.
        expect(screen.queryByRole('switch', { name: 'Site accepts submissions' })).toBeNull();
    });

    it('switches a form on without naming a field, so the API restores what it verified', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { contentType: 'note', enabled: true, verifyEmailField: null } });
        renderWith([]);

        fireEvent.click(await screen.findByRole('switch', { name: 'Note accepts submissions' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/forms/note', { enabled: true }));
    });

    it('offers only Public email fields to verify, and saves the choice', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { contentType: 'signup', enabled: true, verifyEmailField: 'Email' } });
        renderWith([{ contentType: 'signup', enabled: true, verifyEmailField: null }]);

        const select = await screen.findByRole('combobox', { name: 'Email field Sign-up verifies' });
        const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
        expect(options).toEqual(['Do not verify', 'Email']);

        fireEvent.change(select, { target: { value: 'Email' } });

        await waitFor(() =>
            expect(api.put).toHaveBeenCalledWith('/api/forms/signup', { enabled: true, verifyEmailField: 'Email' }),
        );
    });

    it('turns verification off with an empty string', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { contentType: 'signup', enabled: true, verifyEmailField: null } });
        renderWith([{ contentType: 'signup', enabled: true, verifyEmailField: 'Email' }]);

        const select = await screen.findByRole('combobox', { name: 'Email field Sign-up verifies' });
        expect(select).toHaveValue('Email');
        fireEvent.change(select, { target: { value: '' } });

        await waitFor(() =>
            expect(api.put).toHaveBeenCalledWith('/api/forms/signup', { enabled: true, verifyEmailField: '' }),
        );
    });

    it('keeps the field choice closed until the form is on, and says why a type has none', async () => {
        renderWith([]);

        expect(await screen.findByRole('combobox', { name: 'Email field Sign-up verifies' })).toBeDisabled();
        expect(screen.getByText('No email field a visitor can fill in')).toBeInTheDocument();
    });

    it('hides the verify column on an API whose forms carry no verifyEmailField', async () => {
        renderWith([{ contentType: 'signup', enabled: true }]);

        expect(await screen.findByRole('switch', { name: 'Sign-up accepts submissions' })).toBeChecked();
        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('says the module is not running when /api/forms is a 404', async () => {
        renderWith('absent');

        expect(await screen.findByText('Forms are not running here')).toBeInTheDocument();
        expect(screen.queryByRole('switch')).toBeNull();
    });
});
