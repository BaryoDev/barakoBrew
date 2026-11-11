import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }));
vi.mock('next/link', () => ({
    default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

const { api } = await import('@/lib/api');
const { default: ModulesPage } = await import('@/app/(admin)/modules/page');
const { ModuleScreen } = await import('./module-screen');

const get = vi.mocked(api.get);

const base = { contractVersion: 1, schemaState: 'ready', schemaChanges: [] as string[] };
const MODULES = [
    { ...base, name: 'Files', enabled: true, package: 'BarakoCMS.Files', version: '5.1.0', category: 'content', description: 'Uploads.' },
    { ...base, name: 'Forms', enabled: false, package: 'BarakoCMS.Forms', version: '5.1.0', category: 'Content', description: 'Form builder.' },
    { ...base, name: 'Pwa', enabled: false, installed: false, package: 'BarakoCMS.Pwa', version: '5.1.0', category: 'Platform', description: 'Installable site.' },
];

function wrap(ui: ReactNode) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// A braced body: mockReset returns the mock, and a function returned from beforeEach is run by
// vitest as the teardown, which would call the mock once more after the test.
beforeEach(() => {
    get.mockReset();
    toastSuccess.mockReset();
});

describe('All modules page', () => {
    it('renders detected, installed but not enabled, and not installed from /api/modules', async () => {
        get.mockResolvedValue({ data: { items: MODULES } });
        wrap(<ModulesPage />);

        const cards = await screen.findAllByTestId('module-card');
        const byState = (s: string) => cards.filter((c) => c.getAttribute('data-state') === s);
        expect(byState('enabled')).toHaveLength(1);
        expect(byState('installed')).toHaveLength(1);
        // Pwa the API says is absent, plus the 13 first-party modules it did not list at all.
        expect(byState('not-installed')).toHaveLength(14);

        const files = byState('enabled')[0];
        expect(within(files).getByText('Enabled')).toBeTruthy();
        expect(within(files).getByRole('link', { name: 'Open Files' }).getAttribute('href')).toBe('/modules/Files');
        expect(within(files).queryByRole('button', { name: 'Copy install' })).toBeNull();
        expect(within(byState('installed')[0]).getByText('Installed, not enabled')).toBeTruthy();

        const pwa = byState('not-installed').find((c) => within(c).queryByText('Pwa'))!;
        expect(within(pwa).getByText('Not installed')).toBeTruthy();
        expect(within(pwa).getByText('dotnet add package BarakoCMS.Pwa')).toBeTruthy();
        expect(within(pwa).getByRole('button', { name: 'Copy install' })).toBeTruthy();
        expect(within(pwa).queryByRole('link', { name: /^Open/ })).toBeNull();
        expect(pwa.className).toContain('opacity-[.78]');
    });

    it('titles the page All modules, like the sidebar and breadcrumb', async () => {
        get.mockResolvedValue({ data: { items: MODULES } });
        wrap(<ModulesPage />);
        await screen.findAllByTestId('module-card');
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('All modules');
    });

    it('shows a 44px icon tile on every card', async () => {
        get.mockResolvedValue({ data: { items: MODULES } });
        wrap(<ModulesPage />);
        const cards = await screen.findAllByTestId('module-card');
        expect(cards.length).toBeGreaterThan(0);
        for (const card of cards) {
            const tile = within(card).getByTestId('module-tile');
            expect(tile.className).toContain('size-11');
        }
    });

    it('shows GET /api/modules with the installed count out of every module', async () => {
        get.mockResolvedValue({ data: { items: MODULES } });
        wrap(<ModulesPage />);
        expect(await screen.findByText('GET /api/modules · 2 of 16')).toBeTruthy();
    });

    it('copies the install line and says to restart the API', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        get.mockResolvedValue({ data: { items: MODULES } });
        wrap(<ModulesPage />);
        const cards = await screen.findAllByTestId('module-card');
        const pwa = cards.find((c) => within(c).queryByText('Pwa'))!;
        await userEvent.click(within(pwa).getByRole('button', { name: 'Copy install' }));
        expect(writeText).toHaveBeenCalledWith('dotnet add package BarakoCMS.Pwa');
        expect(toastSuccess).toHaveBeenCalledWith(
            'Copied: dotnet add package BarakoCMS.Pwa. Restart the API, then enable it for the tenant.',
        );
    });

    it('groups first-party modules under the design categories, not all under Other', async () => {
        get.mockResolvedValue({ data: { items: MODULES } });
        wrap(<ModulesPage />);
        await screen.findAllByTestId('module-card');

        const filter = screen.getByRole('radiogroup', { name: 'Filter by category' });
        const names = within(filter).getAllByRole('radio').map((r) => r.textContent);
        expect(names).toEqual(['All16', 'Content4', 'Comms2', 'Access2', 'Platform5', 'Insight2', 'Business1']);
        expect(within(filter).queryByRole('radio', { name: /Other/ })).toBeNull();
    });

    it('filters the cards by category', async () => {
        get.mockResolvedValue({ data: { items: MODULES } });
        wrap(<ModulesPage />);
        await screen.findAllByTestId('module-card');

        await userEvent.click(screen.getByRole('radio', { name: /^Access/ }));
        const cards = screen.getAllByTestId('module-card');
        expect(cards).toHaveLength(2);
        expect(cards.map((c) => within(c).getByRole('heading').textContent).sort()).toEqual(['DeviceTrust', 'ExternalAuth']);
    });

    it('lists a module the API sends that the catalog does not know, with its own category', async () => {
        const eighteen = Array.from({ length: 18 }, (_, i) => ({ ...base, name: `Mod${i}`, enabled: true, category: 'Extras' }));
        get.mockResolvedValue({ data: { items: eighteen } });
        wrap(<ModulesPage />);
        const cards = await screen.findAllByTestId('module-card');
        expect(cards.filter((c) => c.getAttribute('data-state') === 'enabled')).toHaveLength(18);
        expect(screen.getByRole('radio', { name: /^Extras/ }).textContent).toBe('Extras18');
    });

    it('says the list is not available on a refusal', async () => {
        get.mockRejectedValue(Object.assign(new Error('403'), { isAxiosError: true, response: { status: 403 } }));
        wrap(<ModulesPage />);
        expect(await screen.findByText('The module list is not available to you.')).toBeTruthy();
    });
});

describe('module screen template', () => {
    const filesModule = { ...base, name: 'Files', enabled: true };

    it('shows a redacted value as the marker, never as an empty field', async () => {
        get.mockResolvedValue({
            data: {
                module: 'Files',
                section: 'Modules:Files',
                entries: [
                    { key: 'Host', value: 'files.example.com', redacted: false, scope: 'deployment', source: 'environment' },
                    { key: 'ApiKey', value: null, redacted: true, scope: 'deployment', source: 'appsettings' },
                ],
            },
        });
        wrap(<ModuleScreen module={filesModule} />);

        expect(await screen.findByText('files.example.com')).toBeTruthy();
        const marker = screen.getByTestId('config-redacted');
        expect(marker.textContent).toBe('Redacted');
        expect(screen.queryAllByRole('textbox')).toHaveLength(0);
        expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    });

    it('says the configuration is unavailable on a 403 instead of an empty card', async () => {
        get.mockRejectedValue(Object.assign(new Error('403'), { isAxiosError: true, response: { status: 403 } }));
        wrap(<ModuleScreen module={filesModule} />);
        expect(await screen.findByText(/not available to you/)).toBeTruthy();
    });

    it('renders the module content below the Configuration card', async () => {
        get.mockResolvedValue({ data: { module: 'Files', section: 's', entries: [] } });
        wrap(
            <ModuleScreen module={filesModule}>
                <p>module body</p>
            </ModuleScreen>,
        );
        expect(await screen.findByText('module body')).toBeTruthy();
        expect(screen.getByText('Configuration')).toBeTruthy();
    });

    it.each([
        ['an empty body', ''],
        ['null', null],
        ['no entries', { module: 'Files', section: 's' }],
        ['entries that is not a list', { module: 'Files', section: 's', entries: 'none' }],
    ])('does not crash on a configuration reply with %s', async (_label, body) => {
        get.mockResolvedValue({ data: body });
        wrap(<ModuleScreen module={filesModule} />);
        expect(await screen.findByText(/cannot read/)).toBeTruthy();
        expect(screen.getByText('Configuration')).toBeTruthy();
    });

    it('skips rows that are not entries and still renders the rest', async () => {
        get.mockResolvedValue({
            data: {
                module: 'Files',
                section: 's',
                entries: [null, 7, { value: 'no key' }, { key: 'Host', value: 'h.example', redacted: false, scope: 'deployment', source: 'environment' }],
            },
        });
        wrap(<ModuleScreen module={filesModule} />);
        expect(await screen.findByText('h.example')).toBeTruthy();
    });
});
