import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// Radix sizes its dialog with one, and jsdom ships no implementation.
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { accessFrom } = await import('@/lib/access');
type AccessResult = ReturnType<typeof accessFrom>;
const EVERYTHING = accessFrom({ userId: 'u', username: 'u', tenant: 't', roles: [], capabilities: ['*'] }, []);
let access: AccessResult = EVERYTHING;
vi.mock('@/hooks/use-access', () => ({ useAccess: () => access }));

const { api } = await import('@/lib/api');
const { AxiosError, AxiosHeaders } = await import('axios');
const { default: WorkflowsPage } = await import('./page');

function workflow(id: string, name: string, extra: Record<string, unknown> = {}) {
    return {
        id,
        name,
        triggerContentType: 'post',
        triggerEvent: 'Published',
        conditions: {},
        actions: [{ type: 'Webhook', parameters: {} }],
        ...extra,
    };
}

function page(items: unknown[]) {
    return { items, page: 1, pageSize: 25, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
}

function refusal(status: number) {
    return new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        statusText: '',
        data: {},
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

function healthOf(workflowId: string, extra: Record<string, unknown> = {}) {
    return {
        workflowId,
        name: 'x',
        enabled: true,
        lastOutcomes: [],
        successRate: null,
        finishedRuns: 0,
        averageActionDurationMs: null,
        ...extra,
    };
}

/** The list, and what `/api/workflows/health` does: an array of rows, or an error to throw. */
function renderWith(items: unknown[], health: unknown[] | Error = refusal(404)) {
    vi.mocked(api.get).mockImplementation((async (url: string) => {
        if (url === '/api/workflows/health') {
            if (health instanceof Error) throw health;
            return { data: { ...page(health), windowDays: 7, windowFrom: '2026-10-13T00:00:00Z' } };
        }
        return { data: page(items) };
    }) as typeof api.get);
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <WorkflowsPage />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    access = EVERYTHING;
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(api.delete).mockReset();
    push.mockReset();
});

describe('the workflow list', () => {
    it('switches a workflow off without opening it', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: {} });
        renderWith([workflow('w1', 'Announce', { enabled: true }), workflow('w2', 'Archive', { enabled: false })]);

        const on = await screen.findByRole('switch', { name: 'Announce is on' });
        expect(on).toBeChecked();
        expect(screen.getByRole('switch', { name: 'Archive is on' })).not.toBeChecked();

        fireEvent.click(on);

        await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/workflows/w1/enabled', { enabled: false }));
        expect(push).not.toHaveBeenCalled();
    });

    it('deletes a workflow only after confirming, and does not open it', async () => {
        vi.mocked(api.delete).mockResolvedValue({ status: 204 });
        renderWith([workflow('w1', 'Announce', { enabled: true })]);

        fireEvent.click(await screen.findByRole('button', { name: 'Delete Announce' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(api.delete).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/workflows/w1'));
        expect(push).not.toHaveBeenCalled();
    });

    it('offers neither control on an API whose workflows carry no enabled field', async () => {
        renderWith([workflow('w1', 'Announce'), workflow('w2', 'Archive')]);

        expect(await screen.findByText('Announce')).toBeInTheDocument();
        expect(screen.getByText('Archive')).toBeInTheDocument();
        expect(screen.queryByRole('switch')).toBeNull();
        expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
    });

    it('still opens a workflow from its row', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })]);

        fireEvent.click(await screen.findByText('Announce'));

        expect(push).toHaveBeenCalledWith('/workflows/w1');
    });
});

describe('the health tiles', () => {
    it('shows no runs yet, a rate with its sample size, and the last outcomes', async () => {
        renderWith(
            [workflow('w1', 'Announce', { enabled: true }), workflow('w2', 'Archive', { enabled: true })],
            [
                healthOf('w1'),
                healthOf('w2', {
                    successRate: 1,
                    finishedRuns: 3,
                    lastOutcomes: [{ runId: 'r1', status: 'Succeeded', createdAt: '2026-10-19T00:00:00Z' }],
                }),
            ],
        );

        expect(await screen.findByText('No runs yet')).toBeInTheDocument();
        expect(screen.getByText('100%')).toBeInTheDocument();
        expect(screen.getByText(/3 of 3/)).toBeInTheDocument();
        expect(within(screen.getByRole('list', { name: 'Last outcomes' })).getByText('Succeeded')).toBeInTheDocument();
    });

    it('does not mistake a rate of zero for no runs', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], [healthOf('w1', { successRate: 0, finishedRuns: 2 })]);

        expect(await screen.findByText('0%')).toBeInTheDocument();
        expect(screen.getByText(/0 of 2/)).toBeInTheDocument();
        expect(screen.queryByText('No runs yet')).toBeNull();
    });

    it('shows no health column and no Run now when health answers 404', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], refusal(404));

        expect(await screen.findByText('Announce')).toBeInTheDocument();
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflows/health', expect.anything()));
        // Run now is not shown while health is pending, so wait for the settled state, not the request.
        await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'Run now' })).toBeNull());
        expect(screen.queryByRole('columnheader', { name: 'Health' })).toBeNull();
        expect(screen.queryByText('No runs yet')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Run Announce now' })).toBeNull();
    });

    it('does not show Run now before health has answered, then shows it', async () => {
        let release: (value: unknown) => void = () => {};
        vi.mocked(api.get).mockImplementation((async (url: string) => {
            if (url === '/api/workflows/health') {
                await new Promise((resolve) => (release = resolve));
                return { data: { ...page([healthOf('w1')]), windowDays: 7 } };
            }
            return { data: page([workflow('w1', 'Announce', { enabled: true })]) };
        }) as typeof api.get);
        render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <WorkflowsPage />
            </QueryClientProvider>,
        );

        expect(await screen.findByText('Announce')).toBeInTheDocument();
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflows/health', expect.anything()));
        expect(screen.queryByRole('button', { name: 'Run Announce now' })).toBeNull();

        await act(async () => release(undefined));

        expect(await screen.findByRole('button', { name: 'Run Announce now' })).toBeInTheDocument();
    });

    it('shows the list and Run now without health tiles when health fails with a 500', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], refusal(500));

        expect(await screen.findByText('Announce')).toBeInTheDocument();
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflows/health', expect.anything()));
        // A 500 says nothing about whether the run route is there, so the button stays.
        expect(await screen.findByRole('button', { name: 'Run Announce now' })).toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: 'Health' })).toBeNull();
        expect(screen.queryByText('No runs yet')).toBeNull();
    });

    it('still tiles the other workflows when one health row lacks lastOutcomes and finishedRuns', async () => {
        const bare: Record<string, unknown> = healthOf('w1');
        delete bare.lastOutcomes;
        delete bare.finishedRuns;
        renderWith(
            [workflow('w1', 'Announce', { enabled: true }), workflow('w2', 'Archive', { enabled: true })],
            [bare, healthOf('w2', { successRate: 1, finishedRuns: 3 })],
        );

        expect(await screen.findByText('100%')).toBeInTheDocument();
        expect(screen.getAllByText('No runs yet')).toHaveLength(1);
    });

    it('does not ask for health from a caller who cannot see runs', async () => {
        access = accessFrom({ userId: 'u', username: 'u', tenant: 't', roles: [], capabilities: ['manage_workflows'] }, []);
        renderWith([workflow('w1', 'Announce', { enabled: true })], [healthOf('w1')]);

        expect(await screen.findByText('Announce')).toBeInTheDocument();
        expect(api.get).not.toHaveBeenCalledWith('/api/workflows/health', expect.anything());
    });

    it('opens the run now dialog from a row without opening the workflow', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], [healthOf('w1')]);

        fireEvent.click(await screen.findByRole('button', { name: 'Run Announce now' }));

        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(push).not.toHaveBeenCalled();
    });
});

