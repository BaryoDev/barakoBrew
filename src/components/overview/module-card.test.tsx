import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ReactElement } from 'react';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});
let tenant = 'cafe';
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => tenant }));
let report: unknown;
vi.mock('@/hooks/use-modules', () => ({ useModules: () => ({ data: report }) }));

const { api } = await import('@/lib/api');
const { ModuleCard, ModuleCards } = await import('./module-card');

const render = (ui: ReactElement) =>
    rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

function httpError(status: number) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data: {},
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

const decl = { id: 'today', title: 'Daily summary', route: '/api/reports/today' };
const answer = (over: Record<string, unknown> = {}) => ({
    data: { state: 'ok', text: 'All good', rows: [{ label: 'Sales', value: '12' }], note: 'From cache', updatedAt: new Date().toISOString(), ...over },
});

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    report = undefined;
    tenant = 'cafe';
});

describe('ModuleCard', () => {
    it('draws an ok answer as text, rows, note and updated time', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        render(<ModuleCard module="Reports" card={decl} />);
        expect(await screen.findByRole('heading', { name: 'Daily summary' })).toBeInTheDocument();
        expect(screen.getByText('All good')).toBeInTheDocument();
        expect(screen.getByText('Sales')).toBeInTheDocument();
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('From cache')).toBeInTheDocument();
        expect(screen.getByText(/Updated/)).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith('/api/reports/today', { skipAuthRefresh: true });
    });

    it.each(['empty', 'unavailable'])('draws a %s answer as title and muted text only', async (state) => {
        vi.mocked(api.get).mockResolvedValue(answer({ state, text: 'Nothing yet' }));
        render(<ModuleCard module="Reports" card={decl} />);
        const text = await screen.findByText('Nothing yet');
        expect(text).toHaveClass('text-muted-foreground');
        expect(screen.getByRole('heading', { name: 'Daily summary' })).toBeInTheDocument();
        expect(screen.queryByText('Sales')).toBeNull();
        expect(screen.queryByText(/Updated/)).toBeNull();
    });

    it.each([
        [401, 1],
        [403, 1],
        [404, 1],
        [503, 2],
        [500, 2],
    ])('draws nothing on a %s and asks %s time(s)', async (status, calls) => {
        vi.mocked(api.get).mockRejectedValue(httpError(status));
        const { container } = render(<ModuleCard module="Reports" card={decl} />);
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(calls), { timeout: 3000 });
        await waitFor(() => expect(container).toBeEmptyDOMElement(), { timeout: 3000 });
        expect(api.get).toHaveBeenCalledTimes(calls);
    });

    it('asks without a session refresh', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        render(<ModuleCard module="Reports" card={decl} />);
        await screen.findByText('All good');
        expect(api.get).toHaveBeenCalledWith('/api/reports/today', { skipAuthRefresh: true });
    });

    it('keys the cache by tenant', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        const shared = new QueryClient();
        const ui = (
            <QueryClientProvider client={shared}>
                <ModuleCard module="Reports" card={decl} />
            </QueryClientProvider>
        );
        const first = rtlRender(ui);
        await screen.findByText('All good');
        expect(api.get).toHaveBeenCalledTimes(1);
        first.unmount();
        tenant = 'bistro';
        rtlRender(ui);
        await screen.findByText('All good');
        expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('draws nothing on content it does not recognise', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { state: 'surprise', text: 'x' } });
        const { container } = render(<ModuleCard module="Reports" card={decl} />);
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        await waitFor(() => expect(container).toBeEmptyDOMElement());
    });

    it('draws markup in the text as literal text', async () => {
        const evil = '<img src=x onerror=alert(1)>';
        vi.mocked(api.get).mockResolvedValue(answer({ text: evil, rows: [{ label: evil, value: evil }], note: evil }));
        const { container } = render(<ModuleCard module="Reports" card={decl} />);
        await screen.findByRole('heading', { name: 'Daily summary' });
        expect(screen.getAllByText(evil).length).toBeGreaterThanOrEqual(3);
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('a')).toBeNull();
    });
});

describe('ModuleCards on the Overview', () => {
    const mod = (name: string, enabled: boolean, cards?: unknown) => ({
        name, contractVersion: 1, enabled, schemaState: 'ready', schemaChanges: [], ...(cards === undefined ? {} : { cards }),
    });

    it('draws cards of enabled modules in module order then card order', async () => {
        report = {
            kind: 'modules',
            modules: [
                mod('Reports', true, [decl, { ...decl, id: 'week', title: 'Weekly', route: '/api/reports/week' }]),
                mod('Off', false, [{ ...decl, id: 'hidden', title: 'Hidden', route: '/api/off/x' }]),
                mod('Other', true, [{ ...decl, id: 'o', title: 'Other card', route: '/api/other/x' }]),
            ],
        };
        vi.mocked(api.get).mockResolvedValue(answer());
        render(<ModuleCards />);
        await waitFor(() => expect(screen.getAllByRole('heading')).toHaveLength(3));
        expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Daily summary', 'Weekly', 'Other card']);
        expect(api.get).not.toHaveBeenCalledWith('/api/off/x', expect.anything());
    });

    it('changes nothing against an older server with no cards', () => {
        report = { kind: 'modules', modules: [mod('Reports', true), mod('Files', true, 'nope')] };
        const { container } = render(<ModuleCards />);
        expect(container).toBeEmptyDOMElement();
        expect(api.get).not.toHaveBeenCalled();
    });

    it('draws nothing while the module list is unreadable', () => {
        report = { kind: 'unreadable' };
        const { container } = render(<ModuleCards />);
        expect(container).toBeEmptyDOMElement();
    });
});
