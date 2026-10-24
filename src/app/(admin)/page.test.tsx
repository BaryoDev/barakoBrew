import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({ push: vi.fn() }),
}));

const { api } = await import('@/lib/api');
const { default: DashboardPage } = await import('./page');

const fail = (status: number) =>
    Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: { status } });

const page = (items: unknown[], totalItems = items.length) => ({
    data: { items, totalItems, page: 1, pageSize: 20, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
});

interface Answers {
    published?: number;
    drafts?: number;
    runs?: number;
    failed?: number;
    version?: string;
    contract?: number;
    health?: 'fail' | Record<string, { status: string; duration?: string }>;
    workflowHealth?: 'fail' | '404' | { successRate: number; finishedRuns: number };
    analytics?: 'absent';
    workflows?: 'fail';
    contents?: 'fail';
    runList?: 'fail';
}

function renderOverview(answers: Answers = {}) {
    const { published = 42, drafts = 5, runs = 318, failed = 2, version = '4.9.1', contract = 7, health, workflowHealth, analytics, workflows } = answers;
    vi.mocked(api.get).mockImplementation(async (url: string, config?: { params?: unknown }) => {
        const status = (config?.params as { status?: unknown } | undefined)?.status;
        if (url === '/api/meta') return { data: { version, swaggerEnabled: false, apiContractVersion: contract } };
        if (url === '/api/monitoring/health') {
            if (health === 'fail') throw fail(500);
            return {
                data: {
                    status: 'Healthy',
                    totalDuration: '0',
                    entries: health ?? {
                        postgres: { status: 'Healthy', duration: '00:00:00.0040000' },
                        storage: { status: 'Degraded' },
                    },
                },
            };
        }
        if (url === '/api/workflows/health') {
            if (workflowHealth === 'fail') throw fail(500);
            if (workflowHealth === '404') throw fail(404);
            const h = workflowHealth ?? { successRate: 0.5, finishedRuns: 4 };
            return {
                data: {
                    items: [
                        {
                            workflowId: 'w1',
                            name: 'Notify',
                            enabled: true,
                            successRate: h.successRate,
                            finishedRuns: h.finishedRuns,
                            lastOutcomes: [{ runId: 'r1', status: 'Succeeded', createdAt: '2026-10-01T00:00:00Z' }],
                        },
                    ],
                    totalItems: 1,
                    page: 1,
                    pageSize: 100,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPreviousPage: false,
                    windowDays: 7,
                },
            };
        }
        if (url === '/api/workflows' && workflows === 'fail') throw fail(500);
        if (url === '/api/workflows')
            return page([{ id: 'w1', name: 'Notify', triggerContentType: 'Article', triggerEvent: 'Published' }]);
        if (url === '/api/analytics/websites' && analytics === 'absent') throw fail(404);
        if (url === '/api/workflow-runs') {
            if (answers.runList === 'fail') throw fail(500);
            return page([], status === 'Failed' ? failed : runs);
        }
        if (url === '/api/contents') {
            if (status === 'Published' && answers.contents === 'fail') throw fail(500);
            if (status === 'Published') return page([], published);
            if (status === 'Draft') return page([], drafts);
            return page([], published + drafts);
        }
        if (url.startsWith('/api/schemas')) return { data: [] };
        return page([]);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <DashboardPage />
        </QueryClientProvider>,
    );
}

const strip = () => screen.findByLabelText('System status');
const card = async (label: string) => (await screen.findByText(label)).closest('a') as HTMLElement;

beforeEach(() => {
    vi.clearAllMocks();
});

describe('the Overview', () => {
    it('still shows the other cards when the health call fails', async () => {
        renderOverview({ health: 'fail', published: 31 });

        expect(await within(await card('Published')).findByText('31')).toBeInTheDocument();
        expect(await screen.findByText('Workflow health')).toBeInTheDocument();
        const status = await strip();
        expect(await within(status).findByText('4.9.1')).toBeInTheDocument();
        expect(within(status).getAllByText('Unknown')).toHaveLength(2);
    });

    it('says what the console speaks next to the contract the API reports', async () => {
        renderOverview({ version: '4.2.8', contract: 5 });
        const status = await strip();
        expect(await within(status).findByText('4.2.8')).toBeInTheDocument();
        expect(within(status).getByText(/5 · console speaks 1 to 12/)).toBeInTheDocument();
    });

    it('shows database latency and storage health from the health entries', async () => {
        renderOverview({ health: { postgres: { status: 'Unhealthy', duration: '00:00:00.0120000' }, storage: { status: 'Healthy' } } });
        const status = await strip();
        expect(await within(status).findByText('Unhealthy')).toBeInTheDocument();
        expect(within(status).getByText(/12 ms/)).toBeInTheDocument();
        expect(within(status).getByText('Healthy')).toBeInTheDocument();
    });

    it('shows the workflow success rate from the health response', async () => {
        renderOverview({ workflowHealth: { successRate: 0.75, finishedRuns: 8 } });
        expect(await screen.findByText(/75%/)).toBeInTheDocument();
        expect(screen.getByText(/6 of 8/)).toBeInTheDocument();
    });

    it('says workflow health could not be read when that call fails', async () => {
        renderOverview({ workflowHealth: 'fail' });
        expect(await screen.findByText(/Couldn.t load workflow health/)).toBeInTheDocument();
    });

    it('does not say there are no workflows when the workflow list fails', async () => {
        renderOverview({ workflows: 'fail' });
        expect(await screen.findByText(/Couldn.t load workflow health/)).toBeInTheDocument();
        expect(screen.queryByText('No workflows yet.')).not.toBeInTheDocument();
    });

    it('hides workflow health against an API without the route', async () => {
        renderOverview({ workflowHealth: '404', published: 4 });
        expect(await within(await card('Published')).findByText('4')).toBeInTheDocument();
        await vi.waitFor(() => expect(screen.queryByText('Workflow health')).not.toBeInTheDocument());
    });

    it('renders when the analytics module is absent', async () => {
        renderOverview({ analytics: 'absent' });
        expect(await screen.findByText('Latest entries')).toBeInTheDocument();
        await vi.waitFor(() => expect(screen.queryAllByText('Visitors')).toHaveLength(0));
    });

    it('says plainly that Live activity has no data yet', async () => {
        renderOverview();
        const live = (await screen.findByText('Live activity')).closest('section') as HTMLElement;
        expect(within(live).getByText(/Not available yet/)).toBeInTheDocument();
    });

    it('lists failed runs under Needs you', async () => {
        renderOverview({ failed: 3 });
        const needs = (await screen.findByText('Needs you', { selector: 'h2' })).closest('section') as HTMLElement;
        expect(await within(needs).findByText('3 workflow runs failed')).toBeInTheDocument();
    });
});
