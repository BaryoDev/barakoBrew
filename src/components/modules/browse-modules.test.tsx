import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/link', () => ({
    default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

const { api } = await import('@/lib/api');
const { default: ModulesPage } = await import('@/app/(admin)/modules/page');
const get = vi.mocked(api.get);
const fetchMock = vi.fn();

const base = { contractVersion: 1, schemaState: 'ready', schemaChanges: [] as string[] };
const INSTALLED = [{ ...base, name: 'Files', enabled: true, package: 'BarakoCMS.Files', version: '5.1.0' }];

const row = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    version: '2.0.0',
    title: id,
    description: `${id} description`,
    owners: ['BaryoDev'],
    totalDownloads: 1234,
    tags: ['barakocms-module'],
    ...extra,
});

function respond(data: unknown[], totalHits = data.length) {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ totalHits, data }) });
}

async function openBrowse() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <ModulesPage />
        </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Browse' }));
}

beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ data: { items: INSTALLED } });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

describe('Browse view', () => {
    it('makes no call to NuGet until Browse is opened', async () => {
        respond([row('A.One')]);
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={client}>
                <ModulesPage />
            </QueryClientProvider>,
        );
        await screen.findAllByTestId('module-card');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('shows a package this deployment already has as installed, matched by package id', async () => {
        respond([row('BarakoCMS.Files'), row('Community.Thing')]);
        await openBrowse();

        const cards = await screen.findAllByTestId('browse-card');
        expect(cards).toHaveLength(2);
        const files = cards.find((c) => within(c).queryByText('BarakoCMS.Files 2.0.0 · 1,234 downloads'))!;
        expect(files.getAttribute('data-state')).toBe('enabled');
        expect(within(files).getByText('Enabled')).toBeTruthy();
        expect(within(files).queryByRole('button', { name: 'Copy install' })).toBeNull();
    });

    it('shows the install line for a package that is not installed', async () => {
        respond([row('Community.Thing')]);
        await openBrowse();

        const card = await screen.findByTestId('browse-card');
        expect(card.getAttribute('data-state')).toBe('not-installed');
        expect(within(card).getByText('dotnet add package Community.Thing')).toBeTruthy();
        expect(within(card).getByRole('button', { name: 'Copy install' })).toBeTruthy();
    });

    it('never offers an Install button', async () => {
        respond([row('Community.Thing'), row('BarakoCMS.Files')]);
        await openBrowse();
        await screen.findAllByTestId('browse-card');
        expect(screen.queryByRole('button', { name: /^install$/i })).toBeNull();
        expect(screen.queryByRole('link', { name: /^install$/i })).toBeNull();
    });

    it('draws a community package with the generic tile and the same fields as ours', async () => {
        respond([row('BarakoCMS.Files'), row('Community.Thing', { owners: ['Somebody Else'] })]);
        await openBrowse();

        const cards = await screen.findAllByTestId('browse-card');
        expect(cards).toHaveLength(2);
        for (const card of cards) {
            expect(within(card).getByTestId('module-tile')).toBeTruthy();
            expect(within(card).getByText(/downloads/)).toBeTruthy();
            expect(within(card).getByRole('link', { name: /NuGet page/ })).toBeTruthy();
        }
        const community = cards.find((c) => within(c).queryByText('Somebody Else'))!;
        expect(community.querySelector('img')).toBeNull();
    });

    it('does not load iconUrl, and renders a description holding <script> as text', async () => {
        respond([row('Evil.Pkg', { iconUrl: 'https://tracker.example/pixel.png', description: '<script>window.__pwned = 1</script>' })]);
        await openBrowse();

        const card = await screen.findByTestId('browse-card');
        expect(card.querySelector('img')).toBeNull();
        expect(card.innerHTML).not.toContain('tracker.example');
        expect(card.querySelector('script')).toBeNull();
        expect(within(card).getByText('<script>window.__pwned = 1</script>')).toBeTruthy();
        expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    });

    it('renders a package id of BarakoCMS.__proto__ as an ordinary card', async () => {
        respond([row('BarakoCMS.__proto__')]);
        await openBrowse();
        const card = await screen.findByTestId('browse-card');
        expect(card.getAttribute('data-state')).toBe('not-installed');
        expect(within(card).getByText(/dotnet add package BarakoCMS.__proto__/)).toBeTruthy();
        expect(({} as Record<string, unknown>).installed).toBeUndefined();
    });

    it('links only https project sites, and opens every link without an opener', async () => {
        respond([
            row('A.Bad', { projectUrl: 'javascript:alert(1)' }),
            row('A.Good', { projectUrl: 'https://example.com/site' }),
        ]);
        await openBrowse();
        await screen.findAllByTestId('browse-card');

        const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '');
        expect(hrefs.length).toBeGreaterThan(0);
        expect(hrefs.some((h) => h.startsWith('javascript:'))).toBe(false);
        const project = screen.getAllByRole('link', { name: /Project site/ });
        expect(project).toHaveLength(1);
        expect(project[0].getAttribute('href')).toBe('https://example.com/site');
        for (const a of [...project, ...screen.getAllByRole('link', { name: /NuGet page/ })]) {
            expect(a.getAttribute('rel')).toContain('noopener');
            expect(a.getAttribute('href')!.startsWith('https://')).toBe(true);
        }
    });

    it('says NuGet is unavailable, not an empty grid, when the call fails', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        await openBrowse();
        expect(await screen.findByText(/package list is unavailable/)).toBeTruthy();
        expect(screen.queryAllByTestId('browse-card')).toHaveLength(0);
    });

    it('says NuGet is unavailable when the reply is not a search response', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => '<html>portal</html>' });
        await openBrowse();
        expect(await screen.findByText(/package list is unavailable/)).toBeTruthy();
    });

    it('says plainly that nothing carries the tag on an empty response', async () => {
        respond([]);
        await openBrowse();
        expect(await screen.findByText('No packages carry the barakocms-module tag.')).toBeTruthy();
        expect(screen.queryAllByTestId('browse-card')).toHaveLength(0);
    });

    it('says when the list was cut', async () => {
        respond([row('A.One'), row('A.Two')], 900);
        await openBrowse();
        expect(await screen.findByText(/Showing the first 2 of 900/)).toBeTruthy();
    });

    it('filters by search, publisher and category', async () => {
        respond([
            row('A.Coffee', { description: 'Brews', owners: ['Ana'], tags: ['barakocms-module', 'ops'] }),
            row('B.Tea', { description: 'Steeps', owners: ['Ben'], tags: ['barakocms-module', 'email'] }),
            row('C.Water', { description: 'Pours', owners: ['Ben'] }),
        ]);
        await openBrowse();
        expect(await screen.findAllByTestId('browse-card')).toHaveLength(3);

        await userEvent.type(screen.getByLabelText('Search'), 'steep');
        expect(screen.getAllByTestId('browse-card')).toHaveLength(1);
        await userEvent.clear(screen.getByLabelText('Search'));

        await userEvent.selectOptions(screen.getByLabelText('Publisher'), 'Ben');
        expect(screen.getAllByTestId('browse-card')).toHaveLength(2);

        await userEvent.click(screen.getByRole('radio', { name: /^Email/ }));
        const cards = screen.getAllByTestId('browse-card');
        expect(cards).toHaveLength(1);
        expect(within(cards[0]).getByText('B.Tea')).toBeTruthy();
    });

    it('says nothing is installed or not when the deployment will not say', async () => {
        get.mockRejectedValue(Object.assign(new Error('403'), { isAxiosError: true, response: { status: 403 } }));
        respond([row('Community.Thing')]);
        await openBrowse();
        const card = await screen.findByTestId('browse-card');
        expect(card.getAttribute('data-state')).toBe('unknown');
        expect(screen.getByText(/installed state is not shown/)).toBeTruthy();
    });
});
