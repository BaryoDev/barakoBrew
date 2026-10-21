import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { COLOR_SLOTS, FONT_ROLES } from '@/lib/site-settings';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => '/site/theme',
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api } = await import('@/lib/api');
const { default: ThemePage } = await import('./page');

const ID = '0b7c1f0e-6d7a-4f3e-9a51-0d1c2b3a4f50';

const FIELDS = [
    { name: 'Name', displayName: 'Site name', type: 'string', isRequired: true },
    { name: 'Colors', displayName: 'Colours', type: 'json', isRequired: false },
    { name: 'Fonts', displayName: 'Fonts', type: 'json', isRequired: false },
];

function serve() {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types') {
            return { data: { items: [{ name: 'site', displayName: 'Site', isSingleton: true, fields: FIELDS }] } };
        }
        if (url === '/api/contents') return { data: { items: [{ id: ID }], totalItems: 1, page: 1, pageSize: 2 } };
        if (url === `/api/contents/${ID}`) {
            return {
                data: {
                    id: ID,
                    contentType: 'site',
                    status: 'Published',
                    version: 1,
                    data: { Name: 'Harbour Club', Colors: { accent: '#17458F', brand: '#112233' } },
                },
                headers: { etag: '"1"' },
            };
        }
        throw new Error(`unexpected ${url}`);
    });
}

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <ThemePage />
        </QueryClientProvider>,
    );
}

function press(body: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => body })));
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    serve();
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('the Theme screen slots', () => {
    it('lists the colour and font slots the site publishes, and shows a stored colour outside them as a site colour', async () => {
        vi.stubEnv('NEXT_PUBLIC_PRESS_URL', 'https://site.example');
        press({
            version: 1,
            blocks: [],
            theme: { colorSlots: ['accent', 'sand', 'moss'], colorAliases: {}, fontRoles: ['display', 'text'] },
        });
        renderPage();

        expect(await screen.findByLabelText('sand')).toBeInTheDocument();
        expect(screen.getByLabelText('moss')).toBeInTheDocument();
        expect(screen.getByLabelText('accent')).toHaveValue('#17458F');
        expect(screen.getByLabelText('display')).toBeInTheDocument();
        expect(screen.getByLabelText('text')).toBeInTheDocument();
        expect(screen.queryByLabelText('pageBg')).toBeNull();
        expect(screen.queryByLabelText('Headings')).toBeNull();
        // brand is stored but not a published slot, so it is a site colour and keeps its value.
        expect(screen.getByLabelText('brand')).toHaveValue('#112233');
    });

    it('lists the built-in slots when no press address is configured', async () => {
        vi.stubEnv('NEXT_PUBLIC_PRESS_URL', '');
        renderPage();

        expect(COLOR_SLOTS.length).toBeGreaterThan(0);
        expect(FONT_ROLES.length).toBeGreaterThan(0);
        await waitFor(() => expect(screen.getByLabelText('pageBg')).toBeInTheDocument());
        for (const slot of COLOR_SLOTS) expect(screen.getByLabelText(slot)).toBeInTheDocument();
        expect(screen.getByLabelText('Headings')).toBeInTheDocument();
    });

    it('lists the built-in slots when the schema publishes no theme', async () => {
        vi.stubEnv('NEXT_PUBLIC_PRESS_URL', 'https://site.example');
        press({ version: 1, blocks: [] });
        renderPage();

        await waitFor(() => expect(screen.getByLabelText('pageBg')).toBeInTheDocument());
        expect(screen.getByLabelText('Headings')).toBeInTheDocument();
    });
});
