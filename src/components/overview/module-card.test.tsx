import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render as rtlRender, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ReactElement } from 'react';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});
let tenant = 'cafe';
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => tenant }));
let report: unknown;
vi.mock('@/hooks/use-modules', () => ({ useModules: () => ({ data: report }) }));

const { api } = await import('@/lib/api');
const { ModuleCard, ModuleCards } = await import('./module-card');

const render = (ui: ReactElement) =>
    rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

function httpError(status: number, headers: Record<string, string> = {}) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data: {},
        statusText: '',
        headers,
        config: { headers: new AxiosHeaders() },
    });
}

const decl = { id: 'today', title: 'Daily summary', route: '/api/reports/today' };
const answer = (over: Record<string, unknown> = {}) => ({
    data: { state: 'ok', text: 'All good', rows: [{ label: 'Sales', value: '12' }], note: 'From cache', updatedAt: new Date().toISOString(), ...over },
});

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
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

describe('ModuleCard refresh', () => {
    const withLabel = { ...decl, refreshLabel: 'Refresh' };

    it('shows no button without a label', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        render(<ModuleCard module="Reports" card={decl} />);
        await screen.findByText('All good');
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('posts to the route once and shows the new text', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        vi.mocked(api.post).mockResolvedValue(answer({ text: 'Fresh news' }));
        render(<ModuleCard module="Reports" card={withLabel} />);
        await screen.findByText('All good');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(await screen.findByText('Fresh news')).toBeInTheDocument();
        expect(screen.queryByText('All good')).toBeNull();
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(api.post).toHaveBeenCalledWith('/api/reports/today', undefined, { skipAuthRefresh: true });
    });

    it('sends one POST for two quick clicks', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        let release: (value: unknown) => void = () => {};
        vi.mocked(api.post).mockReturnValue(new Promise((resolve) => (release = resolve)) as never);
        render(<ModuleCard module="Reports" card={withLabel} />);
        await screen.findByText('All good');
        const button = screen.getByRole('button', { name: 'Refresh' });
        // Both clicks land before React re-renders, so only the ref can stop the second one.
        act(() => {
            fireEvent.click(button);
            fireEvent.click(button);
        });
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(button).toBeDisabled();
        release(answer({ text: 'Fresh news' }));
        await screen.findByText('Fresh news');
        expect(api.post).toHaveBeenCalledTimes(1);
    });

    it('shows the wait from Retry-After on a 429 and keeps the old text', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        vi.mocked(api.post).mockRejectedValue(httpError(429, { 'retry-after': '30' }));
        render(<ModuleCard module="Reports" card={withLabel} />);
        await screen.findByText('All good');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(await screen.findByText('Try again in 30 seconds.')).toBeInTheDocument();
        expect(screen.getByText('All good')).toBeInTheDocument();
    });

    it('reads Retry-After from a real AxiosHeaders instance', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        const error = new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
            status: 429,
            data: {},
            statusText: '',
            headers: new AxiosHeaders({ 'Retry-After': '45' }),
            config: { headers: new AxiosHeaders() },
        });
        vi.mocked(api.post).mockRejectedValue(error);
        render(<ModuleCard module="Reports" card={withLabel} />);
        await screen.findByText('All good');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(await screen.findByText('Try again in 45 seconds.')).toBeInTheDocument();
    });

    it.each([
        ['0', 'Try again in 1 second.'],
        ['1', 'Try again in 1 second.'],
        ['99999', 'Try again in 3600 seconds.'],
        ['soon', 'Try again shortly.'],
    ])('turns Retry-After %s into "%s"', async (header, line) => {
        vi.mocked(api.get).mockResolvedValue(answer());
        vi.mocked(api.post).mockRejectedValue(httpError(429, { 'retry-after': header }));
        render(<ModuleCard module="Reports" card={withLabel} />);
        await screen.findByText('All good');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(await screen.findByText(line)).toBeInTheDocument();
    });

    it('keeps an empty status region mounted before any message', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        render(<ModuleCard module="Reports" card={withLabel} />);
        await screen.findByText('All good');
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('shows could not refresh on a 401 and asks for no session refresh', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        vi.mocked(api.post).mockRejectedValue(httpError(401));
        render(<ModuleCard module="Reports" card={withLabel} />);
        await screen.findByText('All good');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(await screen.findByText('Could not refresh.')).toBeInTheDocument();
        expect(screen.getByText('All good')).toBeInTheDocument();
        expect(api.post).toHaveBeenCalledWith('/api/reports/today', undefined, { skipAuthRefresh: true });
    });

    it('says try again shortly on a 429 with no header', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        vi.mocked(api.post).mockRejectedValue(httpError(429));
        render(<ModuleCard module="Reports" card={withLabel} />);
        await screen.findByText('All good');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(await screen.findByText('Try again shortly.')).toBeInTheDocument();
        expect(screen.getByText('All good')).toBeInTheDocument();
    });

    it('keeps the old text and says it could not refresh on a 500', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        vi.mocked(api.post).mockRejectedValue(httpError(500));
        render(<ModuleCard module="Reports" card={withLabel} />);
        await screen.findByText('All good');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(await screen.findByText('Could not refresh.')).toBeInTheDocument();
        expect(screen.getByText('All good')).toBeInTheDocument();
    });

    it('keeps the old text and says it could not refresh on an invalid body', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        vi.mocked(api.post).mockResolvedValue({ data: { state: 'surprise' } });
        render(<ModuleCard module="Reports" card={withLabel} />);
        await screen.findByText('All good');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(await screen.findByText('Could not refresh.')).toBeInTheDocument();
        expect(screen.getByText('All good')).toBeInTheDocument();
    });

    it('clears the line on the next good refresh', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        vi.mocked(api.post).mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(answer({ text: 'Fresh news' }));
        render(<ModuleCard module="Reports" card={withLabel} />);
        await screen.findByText('All good');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        await screen.findByText('Could not refresh.');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        await screen.findByText('Fresh news');
        expect(screen.queryByText('Could not refresh.')).toBeNull();
    });

    it.each(['empty', 'unavailable'])('shows the button on a %s card', async (state) => {
        vi.mocked(api.get).mockResolvedValue(answer({ state, text: 'Nothing yet' }));
        render(<ModuleCard module="Reports" card={withLabel} />);
        await screen.findByText('Nothing yet');
        expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
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

describe('ModuleCard visual parts', () => {
    const parts = () => ({
        text: 'Less rain than last week',
        stats: [{ label: 'Rainfall', value: 69, previous: 78 }],
        series: {
            label: 'This week',
            previousLabel: 'Last week',
            points: [
                { date: '2026-11-19', value: 5, previous: 8 },
                { date: '2026-11-20', value: 9, previous: 4 },
            ],
        },
        bars: { label: 'Wettest towns', items: [{ label: 'Oslo', value: 13 }] },
        checks: [{ label: 'Rain gauge', tone: 'ok' }],
        rowsLabel: 'Readings',
    });

    it('draws the 1.14.0 markup when there are no parts', async () => {
        vi.mocked(api.get).mockResolvedValue(answer());
        const { container } = render(<ModuleCard module="Reports" card={decl} />);
        await screen.findByText('Sales');
        expect(container.querySelector('dl')).not.toBeNull();
        expect(container.querySelector('details')).toBeNull();
        expect(container.querySelector('[data-testid^="card-"]')).toBeNull();
    });

    it('moves rows behind a closed disclosure labelled by rowsLabel', async () => {
        vi.mocked(api.get).mockResolvedValue(answer(parts()));
        const { container } = render(<ModuleCard module="Reports" card={decl} />);
        await screen.findByText('Readings');
        const details = container.querySelector('details')!;
        expect(details.open).toBe(false);
        expect(details.querySelector('summary')).toHaveTextContent('Readings');
        expect(details.querySelector('dl')).toHaveTextContent('Sales');
    });

    it('uses Details when rowsLabel is absent', async () => {
        vi.mocked(api.get).mockResolvedValue(answer({ ...parts(), rowsLabel: undefined }));
        const { container } = render(<ModuleCard module="Reports" card={decl} />);
        await screen.findByText('Details');
        expect(container.querySelector('summary')).toHaveTextContent('Details');
    });

    it('draws the parts in order', async () => {
        vi.mocked(api.get).mockResolvedValue(answer(parts()));
        const { container } = render(<ModuleCard module="Reports" card={{ ...decl, refreshLabel: 'Refresh' }} />);
        await screen.findByTestId('card-stats');
        const order = [
            container.querySelector('p.text-secondary-foreground')!,
            screen.getByTestId('card-stats'),
            screen.getByTestId('card-series'),
            screen.getByTestId('card-bars'),
            screen.getByTestId('card-checks'),
            container.querySelector('details')!,
            screen.getByRole('button', { name: 'Refresh' }),
        ];
        for (let i = 0; i < order.length - 1; i++) {
            expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
    });

    it('keeps the card when one part is broken', async () => {
        vi.mocked(api.get).mockResolvedValue(answer({ ...parts(), series: { label: 'This week', points: [{ date: 'nope', value: 1 }] } }));
        render(<ModuleCard module="Reports" card={decl} />);
        await screen.findByTestId('card-stats');
        expect(screen.queryByTestId('card-series')).toBeNull();
        expect(screen.getByTestId('card-bars')).toBeInTheDocument();
    });

    it('draws part text as literal text', async () => {
        const bomb = '<img src=x onerror=alert(1)>';
        vi.mocked(api.get).mockResolvedValue(
            answer({
                stats: [{ label: bomb, value: 1 }],
                series: { label: bomb, previousLabel: bomb, points: [{ date: '2026-11-19', value: 1 }, { date: '2026-11-20', value: 2 }] },
                bars: { label: bomb, items: [{ label: bomb, value: 1 }] },
                checks: [{ label: bomb, tone: 'bad', value: bomb }],
                rowsLabel: bomb,
            }),
        );
        const { container } = render(<ModuleCard module="Reports" card={decl} />);
        await screen.findByTestId('card-stats');
        expect(screen.getAllByText(bomb).length).toBeGreaterThan(5);
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('a')).toBeNull();
    });

    it('draws no parts for an answer that is not ok', async () => {
        vi.mocked(api.get).mockResolvedValue(answer({ ...parts(), state: 'empty' }));
        const { container } = render(<ModuleCard module="Reports" card={decl} />);
        await screen.findByText('Less rain than last week');
        expect(container.querySelector('[data-testid^="card-"]')).toBeNull();
    });

    it('mounts the question box only when the content names a question route', async () => {
        vi.mocked(api.get).mockResolvedValue(
            answer({ ...parts(), question: { route: '/api/reports/question', placeholder: 'Type a question' } }),
        );
        const { unmount } = render(<ModuleCard module="Reports" card={decl} />);
        expect(await screen.findByTestId('card-question')).toBeInTheDocument();
        expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Type a question');
        unmount();

        vi.mocked(api.get).mockResolvedValue(answer(parts()));
        render(<ModuleCard module="Reports" card={decl} />);
        await screen.findByTestId('card-stats');
        expect(screen.queryByTestId('card-question')).toBeNull();
    });
});
