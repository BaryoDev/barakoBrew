import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});
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
    { ...base, name: 'Files', enabled: true, package: 'BarakoCMS.Files', version: '5.1.0', category: 'Content', description: 'Uploads.' },
    { ...base, name: 'Forms', enabled: false, package: 'BarakoCMS.Forms', version: '5.1.0', category: 'Content', description: 'Form builder.' },
    { ...base, name: 'Pwa', enabled: false, installed: false, package: 'BarakoCMS.Pwa', version: '5.1.0', category: 'Delivery', description: 'Installable site.' },
];

function wrap(ui: ReactNode) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// A braced body: mockReset returns the mock, and a function returned from beforeEach is run by
// vitest as the teardown, which would call the mock once more after the test.
beforeEach(() => {
    get.mockReset();
});

describe('All modules page', () => {
    it('renders detected, installed but not enabled, and not installed from /api/modules', async () => {
        get.mockResolvedValue({ data: { items: MODULES } });
        wrap(<ModulesPage />);

        const cards = await screen.findAllByTestId('module-card');
        expect(cards).toHaveLength(3);
        const byState = (s: string) => cards.filter((c) => c.getAttribute('data-state') === s);
        expect(byState('enabled')).toHaveLength(1);
        expect(byState('installed')).toHaveLength(1);
        expect(byState('not-installed')).toHaveLength(1);

        expect(within(byState('enabled')[0]).getByText('Enabled')).toBeTruthy();
        expect(within(byState('installed')[0]).getByText('Installed, not enabled')).toBeTruthy();
        const missing = byState('not-installed')[0];
        expect(within(missing).getByText('Not installed')).toBeTruthy();
        expect(within(missing).getByRole('button', { name: 'Copy install line' })).toBeTruthy();
        expect(within(byState('enabled')[0]).queryByRole('button', { name: 'Copy install line' })).toBeNull();
    });

    it('groups the cards by category', async () => {
        get.mockResolvedValue({ data: { items: MODULES } });
        wrap(<ModulesPage />);
        await screen.findAllByTestId('module-card');

        expect(within(screen.getByRole('region', { name: 'Content' })).getAllByTestId('module-card')).toHaveLength(2);
        expect(within(screen.getByRole('region', { name: 'Delivery' })).getAllByTestId('module-card')).toHaveLength(1);
    });

    it('lists every module the API sends, however many', async () => {
        const eighteen = Array.from({ length: 18 }, (_, i) => ({ ...base, name: `Mod${i}`, enabled: true }));
        get.mockResolvedValue({ data: { items: eighteen } });
        wrap(<ModulesPage />);
        expect(await screen.findAllByTestId('module-card')).toHaveLength(18);
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
});
