import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { exactTime, momentLabel } from '@/lib/relative-time';
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

function runOf(id: string, status: string, extra: Record<string, unknown> = {}) {
    return {
        id,
        workflowDefinitionId: 'w1',
        workflowName: 'Announce',
        contentId: '11111111-1111-1111-1111-111111111111',
        contentType: 'post',
        triggerEvent: 'Published',
        status,
        createdAt: '2026-10-19T10:00:00Z',
        completedAt: null,
        actions: [
            { ordinal: 1, actionType: 'Webhook', status: 'Succeeded', attempts: 1 },
            { ordinal: 2, actionType: 'Email', status: 'Failed', attempts: 1 },
        ],
        ...extra,
    };
}

/**
 * The list, what `/api/workflows/health` does (an array of rows, or an error to throw), and the
 * runs `/api/workflow-runs` answers with.
 */
function renderWith(items: unknown[], health: unknown[] | Error = refusal(404), runs: unknown[] = []) {
    vi.mocked(api.get).mockImplementation((async (url: string) => {
        if (url === '/api/workflows/health') {
            if (health instanceof Error) throw health;
            return { data: { ...page(health), windowDays: 7, windowFrom: '2026-10-13T00:00:00Z' } };
        }
        if (url === '/api/workflow-runs') return { data: page(runs) };
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

describe('the workflow list and the open workflow', () => {
    it('lists the workflows beside the open one, which is the first until another is picked', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true }), workflow('w2', 'Archive', { enabled: true })]);

        const list = await screen.findByRole('list', { name: 'Workflows' });
        expect(within(list).getAllByRole('listitem')).toHaveLength(2);
        expect(within(list).getByRole('button', { name: /Announce/ })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('heading', { name: 'Announce' })).toBeInTheDocument();

        fireEvent.click(within(list).getByRole('button', { name: /Archive/ }));

        expect(screen.getByRole('heading', { name: 'Archive' })).toBeInTheDocument();
        expect(within(list).getByRole('button', { name: /Archive/ })).toHaveAttribute('aria-pressed', 'true');
        expect(within(list).getByRole('button', { name: /Announce/ })).toHaveAttribute('aria-pressed', 'false');
    });

    it('is a list and a pane, not a table', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })]);

        await screen.findByRole('list', { name: 'Workflows' });
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('shows the When banner and the actions in order with their kind in the pane', async () => {
        renderWith([
            workflow('w1', 'Announce', {
                enabled: true,
                actions: [
                    { type: 'Webhook', parameters: { Url: 'https://hooks.example.com/x' } },
                    { type: 'Email', parameters: {} },
                ],
            }),
        ]);

        const steps = await screen.findByRole('list', { name: 'Actions' });
        expect(screen.getByText('When')).toBeInTheDocument();
        // Once on the card, once in the banner.
        expect(screen.getAllByText('post to Published')).toHaveLength(2);
        const items = within(steps).getAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(within(items[0]).getByText('Webhook')).toBeInTheDocument();
        expect(within(items[0]).getByText('Url: https://hooks.example.com/x')).toBeInTheDocument();
        expect(within(items[1]).getByText('Email')).toBeInTheDocument();
    });

    it('still reaches the definition at /workflows/{id}', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })]);

        expect(await screen.findByRole('link', { name: 'Open definition' })).toHaveAttribute('href', '/workflows/w1');
    });

    it('says Off on a workflow that is switched off', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true }), workflow('w2', 'Archive', { enabled: false })]);

        const list = await screen.findByRole('list', { name: 'Workflows' });
        const archive = within(list).getAllByRole('listitem')[1];
        expect(within(archive).getByText('Off')).toBeInTheDocument();
    });

    it('switches a workflow off without opening another', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: {} });
        renderWith([workflow('w1', 'Announce', { enabled: true }), workflow('w2', 'Archive', { enabled: false })]);

        const on = await screen.findByRole('switch', { name: 'Announce is on' });
        expect(on).toBeChecked();
        expect(screen.getByRole('switch', { name: 'Archive is on' })).not.toBeChecked();

        fireEvent.click(on);

        await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/workflows/w1/enabled', { enabled: false }));
        expect(push).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: 'Announce' })).toBeInTheDocument();
    });

    it('deletes the open workflow only after confirming', async () => {
        vi.mocked(api.delete).mockResolvedValue({ status: 204 });
        renderWith([workflow('w1', 'Announce', { enabled: true })]);

        fireEvent.click(await screen.findByRole('button', { name: 'Delete Announce' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(api.delete).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/workflows/w1'));
    });

    it('offers neither control on an API whose workflows carry no enabled field', async () => {
        renderWith([workflow('w1', 'Announce'), workflow('w2', 'Archive')]);

        const list = await screen.findByRole('list', { name: 'Workflows' });
        expect(within(list).getByRole('button', { name: /Announce/ })).toBeInTheDocument();
        expect(within(list).getByRole('button', { name: /Archive/ })).toBeInTheDocument();
        expect(screen.queryByRole('switch')).toBeNull();
        expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
    });
});

describe('the health tiles', () => {
    it('shows Runs here, Succeeded and Avg. action for the open workflow', async () => {
        renderWith(
            [workflow('w1', 'Announce', { enabled: true })],
            [healthOf('w1', { successRate: 1, finishedRuns: 3, averageActionDurationMs: 108 })],
        );

        const tiles = await screen.findByRole('group', { name: /Health/ });
        const text = (label: string) => within(tiles).getByText(label).nextElementSibling;
        expect(text('Runs here')).toHaveTextContent('3');
        expect(text('Succeeded')).toHaveTextContent('100%');
        expect(text('Avg. action')).toHaveTextContent('108 ms');
    });

    it('does not mistake a rate of zero for no runs', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], [healthOf('w1', { successRate: 0, finishedRuns: 2 })]);

        const tiles = await screen.findByRole('group', { name: /Health/ });
        expect(within(tiles).getByText('0%')).toBeInTheDocument();
        expect(within(tiles).getByText('Runs here').nextElementSibling).toHaveTextContent('2');
    });

    it('says n/a for a rate and a time the API has no value for', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], [healthOf('w1')]);

        const tiles = await screen.findByRole('group', { name: /Health/ });
        expect(within(tiles).getByText('Succeeded').nextElementSibling).toHaveTextContent('n/a');
        expect(within(tiles).getByText('Avg. action').nextElementSibling).toHaveTextContent('n/a');
    });

    it('takes the tiles from the open workflow, so picking another changes them', async () => {
        renderWith(
            [workflow('w1', 'Announce', { enabled: true }), workflow('w2', 'Archive', { enabled: true })],
            [healthOf('w1', { successRate: 1, finishedRuns: 3 }), healthOf('w2', { successRate: 0.5, finishedRuns: 4 })],
        );

        const tiles = await screen.findByRole('group', { name: /Health/ });
        expect(within(tiles).getByText('100%')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Archive/ }));

        expect(within(await screen.findByRole('group', { name: /Health/ })).getByText('50%')).toBeInTheDocument();
    });

    it('puts the newest outcome on the card as a chip, in words', async () => {
        renderWith(
            [workflow('w1', 'Announce', { enabled: true })],
            [
                healthOf('w1', {
                    lastOutcomes: [
                        { runId: 'r1', status: 'Succeeded', createdAt: '2026-10-18T00:00:00Z' },
                        { runId: 'r2', status: 'PartiallyFailed', createdAt: '2026-10-19T00:00:00Z' },
                    ],
                }),
            ],
        );

        const card = within(await screen.findByRole('list', { name: 'Workflows' })).getAllByRole('listitem')[0];
        expect(await within(card).findByText('Partly failed')).toBeInTheDocument();
        expect(within(card).queryByText('PartiallyFailed')).toBeNull();
    });

    it('hides the tiles and Recent runs, and still renders the definition, when health answers 404', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], refusal(404));

        expect(await screen.findByRole('list', { name: 'Actions' })).toBeInTheDocument();
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflows/health', expect.anything()));
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull());
        expect(screen.getAllByText('post to Published')).toHaveLength(2);
        expect(screen.queryByRole('group', { name: /Health/ })).toBeNull();
        expect(screen.queryByText('Recent runs')).toBeNull();
        expect(screen.queryByRole('link', { name: /All runs/ })).toBeNull();
        expect(api.get).not.toHaveBeenCalledWith('/api/workflow-runs', expect.anything());
    });

    it('does not show Run now before health has answered, then shows it', async () => {
        let release: (value: unknown) => void = () => {};
        vi.mocked(api.get).mockImplementation((async (url: string) => {
            if (url === '/api/workflows/health') {
                await new Promise((resolve) => (release = resolve));
                return { data: { ...page([healthOf('w1')]), windowDays: 7 } };
            }
            if (url === '/api/workflow-runs') return { data: page([]) };
            return { data: page([workflow('w1', 'Announce', { enabled: true })]) };
        }) as typeof api.get);
        render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <WorkflowsPage />
            </QueryClientProvider>,
        );

        expect(await screen.findByRole('heading', { name: 'Announce' })).toBeInTheDocument();
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflows/health', expect.anything()));
        expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();

        await act(async () => release(undefined));

        expect(await screen.findByRole('button', { name: 'Run now' })).toBeInTheDocument();
    });

    it('shows the definition and Run now without tiles when health fails with a 500', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], refusal(500));

        expect(await screen.findByRole('heading', { name: 'Announce' })).toBeInTheDocument();
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflows/health', expect.anything()));
        // A 500 says nothing about whether the run route is there, so the button stays.
        expect(await screen.findByRole('button', { name: 'Run now' })).toBeInTheDocument();
        expect(screen.queryByRole('group', { name: /Health/ })).toBeNull();
    });

    it('still shows the tiles when a health row lacks lastOutcomes and finishedRuns', async () => {
        const bare: Record<string, unknown> = healthOf('w1');
        delete bare.lastOutcomes;
        delete bare.finishedRuns;
        renderWith([workflow('w1', 'Announce', { enabled: true })], [bare]);

        const tiles = await screen.findByRole('group', { name: /Health/ });
        expect(within(tiles).getByText('Runs here').nextElementSibling).toHaveTextContent('0');
    });

    it('does not ask for health from a caller who cannot see runs', async () => {
        access = accessFrom({ userId: 'u', username: 'u', tenant: 't', roles: [], capabilities: ['manage_workflows'] }, []);
        renderWith([workflow('w1', 'Announce', { enabled: true })], [healthOf('w1')]);

        expect(await screen.findByRole('heading', { name: 'Announce' })).toBeInTheDocument();
        expect(api.get).not.toHaveBeenCalledWith('/api/workflows/health', expect.anything());
        expect(screen.queryByText('Recent runs')).toBeNull();
    });
});

describe('Recent runs', () => {
    const EIGHT = Array.from({ length: 8 }, (_, i) =>
        runOf(`run-${i + 1}`, i === 1 ? 'PartiallyFailed' : 'Succeeded', {
            createdAt: `2026-10-19T10:0${8 - i}:00Z`,
            contentId: `${i + 1}0000000-1111-1111-1111-111111111111`,
        }),
    );

    it('shows the latest five of eight runs, each with a status chip, the entry, a progress strip and a start time', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], [healthOf('w1')], EIGHT);

        const list = await screen.findByRole('list', { name: 'Recent runs' });
        const rows = within(list).getAllByRole('button');
        expect(rows).toHaveLength(5);
        expect(within(rows[0]).getByText('Succeeded')).toBeInTheDocument();
        expect(within(rows[0]).getByText(/post 10000000/)).toBeInTheDocument();
        expect(within(rows[0]).getAllByTestId('progress-segment')).toHaveLength(2);
        // The label is read against the clock, so the test asks the helper for it, and checks the
        // full timestamp is the title.
        const started = '2026-10-19T10:08:00Z';
        const label = within(rows[0]).getByText(momentLabel(started));
        expect(label).toHaveAttribute('title', exactTime(started));
        expect(within(rows[1]).getByText('Partly failed')).toBeInTheDocument();
        expect(within(list).queryByText(/post 60000000/)).toBeNull();
    });

    it('asks the API for the workflow\'s own runs, five of them', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], [healthOf('w1')], EIGHT);

        await screen.findByRole('list', { name: 'Recent runs' });
        const asked = vi.mocked(api.get).mock.calls.filter(([url]) => url === '/api/workflow-runs');
        expect(asked.length).toBeGreaterThan(0);
        expect((asked[0][1] as { params: Record<string, unknown> }).params).toMatchObject({ workflowId: 'w1', pageSize: 5 });
    });

    it('opens the run that was clicked in Workflow runs', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], [healthOf('w1')], EIGHT);

        const rows = within(await screen.findByRole('list', { name: 'Recent runs' })).getAllByRole('button');
        fireEvent.click(rows[3]);

        expect(push).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith('/workflow-runs?run=run-4');
    });

    it('links All runs to Workflow runs', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], [healthOf('w1')], EIGHT);

        expect(await screen.findByRole('link', { name: /All runs/ })).toHaveAttribute('href', '/workflow-runs');
    });

    it('says so when the workflow has not run yet', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], [healthOf('w1')], []);

        expect(await screen.findByText('No runs yet. Press Run now to fire one.')).toBeInTheDocument();
    });

    it('stays out of the way when the API ignored the workflow filter and sent another workflow\'s run', async () => {
        renderWith(
            [workflow('w1', 'Announce', { enabled: true })],
            [healthOf('w1')],
            [runOf('run-1', 'Succeeded'), runOf('run-9', 'Succeeded', { workflowDefinitionId: 'w9' })],
        );

        expect(await screen.findByRole('group', { name: /Health/ })).toBeInTheDocument();
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflow-runs', expect.anything()));
        await waitFor(() => expect(screen.queryByText('Recent runs')).toBeNull());
    });
});

describe('Run now', () => {
    it('opens the run dialog from the pane without leaving the page', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })], [healthOf('w1')]);

        fireEvent.click(await screen.findByRole('button', { name: 'Run now' }));

        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(push).not.toHaveBeenCalled();
    });
});
