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
    data: { items, totalItems, page: 1, pageSize: 20, hasNextPage: false },
});

interface Answers {
    entries?: number;
    version?: string;
    contract?: number;
    health?: 'fail' | Record<string, { status: string }>;
    workflowHealth?: 'fail' | '404' | { successRate: number; finishedRuns: number };
    analytics?: 'absent';
    workflows?: 'fail';
}

function renderOverview(answers: Answers = {}) {
    const { entries = 12, version = '4.9.1', contract = 7, health, workflowHealth, analytics, workflows } = answers;
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/meta') return { data: { version, swaggerEnabled: false, apiContractVersion: contract } };
        if (url === '/api/monitoring/health') {
            if (health === 'fail') throw fail(500);
            return {
                data: {
                    status: 'Healthy',
                    totalDuration: '0',
                    entries: health ?? { postgres: { status: 'Healthy' }, storage: { status: 'Degraded' } },
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
                            lastOutcomes: [{ runId: 'r1', status: 'Completed', createdAt: '2026-10-01T00:00:00Z' }],
                        },
                    ],
                    totalItems: 1,
                    page: 1,
                    pageSize: 100,
                    hasNextPage: false,
                    windowDays: 7,
                },
            };
        }
        if (url === '/api/workflows' && workflows === 'fail') throw fail(500);
        if (url === '/api/workflows') return page([{ id: 'w1', name: 'Notify' }]);
        if (url === '/api/analytics/websites' && analytics === 'absent') throw fail(404);
        if (url.startsWith('/api/contents')) return page([], entries);
        if (url.startsWith('/api/schemas')) return { data: [] };
        if (url === '/api/monitoring/metrics') return { data: { totalRequests: 5, errorRate: 0 } };
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

beforeEach(() => {
    vi.clearAllMocks();
});

describe('the Overview', () => {
    it('still shows the other cards when the health call fails', async () => {
        renderOverview({ health: 'fail', entries: 31 });

        const entries = (await screen.findByText('Entries')).closest('a') as HTMLElement;
        expect(await within(entries).findByText('31')).toBeInTheDocument();
        expect(await screen.findByText('Workflow health')).toBeInTheDocument();
        const status = await strip();
        expect(await within(status).findByText('4.9.1')).toBeInTheDocument();
        expect(within(status).getAllByText('Unknown')).toHaveLength(2);
    });

    it('takes the API version and contract version from the meta response', async () => {
        renderOverview({ version: '4.2.8', contract: 5 });
        const status = await strip();
        expect(await within(status).findByText('4.2.8')).toBeInTheDocument();
        expect(within(status).getByText('5')).toBeInTheDocument();
    });

    it('changes the entry count when the mocked response changes', async () => {
        const first = renderOverview({ entries: 17 });
        const card = (await screen.findByText('Entries')).closest('a') as HTMLElement;
        expect(await within(card).findByText('17')).toBeInTheDocument();
        first.unmount();

        renderOverview({ entries: 903 });
        const next = (await screen.findByText('Entries')).closest('a') as HTMLElement;
        expect(await within(next).findByText('903')).toBeInTheDocument();
        expect(screen.queryByText('17')).not.toBeInTheDocument();
    });

    it('shows database and storage health from the health entries', async () => {
        renderOverview({ health: { postgres: { status: 'Unhealthy' }, storage: { status: 'Healthy' } } });
        const status = await strip();
        expect(await within(status).findByText('Unhealthy')).toBeInTheDocument();
        expect(within(status).getByText('Healthy')).toBeInTheDocument();
    });

    it('shows the workflow success rate from the health response', async () => {
        renderOverview({ workflowHealth: { successRate: 0.75, finishedRuns: 8 } });
        expect(await screen.findByText('75%')).toBeInTheDocument();
        expect(screen.getByText(/6 of 8/)).toBeInTheDocument();
    });

    it('says workflow health could not be read when that call fails', async () => {
        renderOverview({ workflowHealth: 'fail' });
        expect(await screen.findByText('Workflow health could not be read.')).toBeInTheDocument();
    });

    it('does not say there are no workflows when the workflow list fails', async () => {
        renderOverview({ workflows: 'fail' });
        expect(await screen.findByText('Workflow health could not be read.')).toBeInTheDocument();
        expect(screen.queryByText('No workflows yet.')).not.toBeInTheDocument();
    });

    it('hides workflow health against an API without the route', async () => {
        renderOverview({ workflowHealth: '404', entries: 4 });
        expect(await within((await screen.findByText('Entries')).closest('a') as HTMLElement).findByText('4')).toBeInTheDocument();
        await vi.waitFor(() => expect(screen.queryByText('Workflow health')).not.toBeInTheDocument());
    });

    it('renders when the analytics module is absent', async () => {
        renderOverview({ analytics: 'absent' });
        expect(await screen.findByText('Latest entries')).toBeInTheDocument();
        expect(screen.queryByText('Visitors')).not.toBeInTheDocument();
    });
});
