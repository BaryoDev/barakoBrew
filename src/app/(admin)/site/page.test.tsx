import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => '/site',
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api } = await import('@/lib/api');
const { default: SitePage } = await import('./page');

const ID = '0b7c1f0e-6d7a-4f3e-9a51-0d1c2b3a4f50';

function notFound() {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 404,
        data: {},
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

/** The blueprint's identity fields, renamed and sectioned the way a tenant may arrange its own site type. */
const ARRANGED = [
    { name: 'Name', displayName: 'Club name', type: 'string', isRequired: true, section: 'Identity' },
    { name: 'Motto', displayName: 'Motto', type: 'string', isRequired: false, section: 'Identity' },
    { name: 'NavLinks', displayName: 'Navigation', type: 'json', isRequired: false, editor: 'links', section: 'Header' },
    { name: 'Colors', displayName: 'Colours', type: 'json', isRequired: false, section: 'Look' },
    { name: 'StyleRecipes', displayName: 'Recipes', type: 'json', isRequired: false, section: 'Recipes' },
];

const BLUEPRINT = [
    { name: 'Name', displayName: 'Site name', type: 'string', isRequired: true },
    { name: 'Tagline', displayName: 'Tagline', type: 'string', isRequired: false },
];

function serve(fields: unknown[]) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types') {
            return { data: { items: [{ name: 'site', displayName: 'Site', isSingleton: true, fields }] } };
        }
        if (url === '/api/contents') return { data: { items: [{ id: ID }], totalItems: 1, page: 1, pageSize: 2 } };
        if (url === `/api/contents/${ID}`) {
            return {
                data: {
                    id: ID,
                    contentType: 'site',
                    status: 'Published',
                    version: 3,
                    data: { Name: 'Harbour Club', Motto: 'Row on', NavLinks: [{ label: 'Join', href: '/join' }], Colors: { accent: '#17458F' } },
                },
                headers: { etag: '"3"' },
            };
        }
        throw notFound();
    });
}

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <SitePage />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
});

describe('the Site screen', () => {
    it('is drawn from a site type that names sections, with its labels, its sections and its hints', async () => {
        serve(ARRANGED);
        renderPage();

        const identity = (await screen.findByText('Identity', { selector: 'legend' })).closest('fieldset')!;
        expect(within(identity).getByLabelText(/Club name/)).toHaveValue('Harbour Club');
        expect(within(identity).getByLabelText(/Motto/)).toHaveValue('Row on');

        // The links hint gives the pair list, not a JSON box.
        const header = screen.getByText('Header', { selector: 'legend' }).closest('fieldset')!;
        const links = within(header).getAllByRole('listitem');
        expect(links).toHaveLength(1);
        expect(within(links[0]).getByDisplayValue('/join')).toBeInTheDocument();

        // Colours belong to the Theme screen, and the hard-coded layout is not drawn.
        expect(screen.queryByText('Look', { selector: 'legend' })).toBeNull();
        expect(screen.queryByText('Recipes', { selector: 'legend' })).toBeNull();
        expect(screen.queryByLabelText('Site name (required)')).toBeNull();
    });

    it('saves an edit made on the drawn screen', async () => {
        serve(ARRANGED);
        vi.mocked(api.put).mockResolvedValue({ data: { id: ID, version: 4 }, headers: {} });
        renderPage();

        fireEvent.change(await screen.findByLabelText(/Motto/), { target: { value: 'Row together' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        const body = vi.mocked(api.put).mock.calls[0][1] as { data: Record<string, unknown> };
        expect(body.data.Motto).toBe('Row together');
        expect(body.data.Colors).toEqual({ accent: '#17458F' });
    });

    it('keeps its own layout for a site type that names no section', async () => {
        serve(BLUEPRINT);
        renderPage();

        expect(await screen.findByLabelText('Site name (required)')).toHaveValue('Harbour Club');
        expect(screen.queryByRole('group')).toBeNull();
    });
});
