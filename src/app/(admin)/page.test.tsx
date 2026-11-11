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
    /** The status of the one outcome the health answer lists. Left out, Succeeded. */
    outcome?: string;
    analytics?: 'absent';
    workflows?: 'fail';
    contents?: 'fail';
    runList?: 'fail';
    /** Rows of GET /api/activity, or how it refuses. Left out, it is a 404: an API older than 5.5. */
    activity?: unknown[] | 'forbidden';
}

function renderOverview(answers: Answers = {}) {
    const { published = 42, drafts = 5, runs = 318, failed = 2, version = '4.9.1', contract = 7, health, workflowHealth, analytics, workflows } = answers;
    vi.mocked(api.get).mockImplementation(async (url: string, config?: { params?: unknown }) => {
        const status = (config?.params as { status?: unknown } | undefined)?.status;
        if (url === '/api/activity') {
            if (answers.activity === 'forbidden') throw fail(403);
            if (!answers.activity) throw fail(404);
            return { data: { items: answers.activity, cursor: 'c', hasMore: false } };
        }
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
                            lastOutcomes: [{ runId: 'r1', status: answers.outcome ?? 'Succeeded', createdAt: '2026-10-01T00:00:00Z' }],
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
            if (status === 'PartiallyFailed') return page([], 0);
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
    it('says Partly failed on the workflow health chip, never the enum name', async () => {
        renderOverview({ outcome: 'PartiallyFailed' });

        const row = (await screen.findByText('Workflow health')).closest('section') as HTMLElement;
        expect(await within(row).findByText('Partly failed')).toBeInTheDocument();
        expect(within(row).queryByText('PartiallyFailed')).toBeNull();
    });

    it('still shows the other cards when the health call fails', async () => {
        renderOverview({ health: 'fail', published: 31 });

        expect(await within(await card('Published')).findByText('31')).toBeInTheDocument();
        expect(await screen.findByText('Workflow health')).toBeInTheDocument();
        const status = await strip();
        expect(await within(status).findByText('up · 4.9.1')).toBeInTheDocument();
        expect(within(status).getAllByText('Unknown')).toHaveLength(2);
    });

    it('has no Contract item, and leads the strip with a verdict pill', async () => {
        renderOverview({ version: '4.2.8', contract: 5 });
        const status = await strip();
        expect(await within(status).findByText('up · 4.2.8')).toBeInTheDocument();
        expect(within(status).queryByText('Contract')).toBeNull();
        expect(status.textContent).not.toMatch(/console speaks/);
        expect(within(status).getByRole('link', { name: /warning|All systems normal/ })).toBeInTheDocument();
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

    it('lists the rows of the activity feed under Live activity', async () => {
        renderOverview({
            activity: [
                { id: 'a1', at: new Date().toISOString(), kind: 'published', severity: 'info', actor: { kind: 'user', name: 'Ana' }, subject: { kind: 'entry', id: 'e1', title: 'New menu' }, text: 'Published an entry.', ref: '/content/e1' },
            ],
        });
        const live = (await screen.findByText('Live activity')).closest('section') as HTMLElement;
        expect(await within(live).findByText('Ana')).toBeInTheDocument();
        expect(within(live).getByText('New menu')).toBeInTheDocument();
        expect(within(live).queryByText(/677|Not available yet/)).toBeNull();
    });

    it('falls back to a note and the audit log when the API has no activity feed', async () => {
        renderOverview();
        const live = (await screen.findByText('Live activity')).closest('section') as HTMLElement;
        expect(await within(live).findByRole('link', { name: 'audit log' })).toBeInTheDocument();
        expect(within(live).queryByText(/677/)).toBeNull();
    });

    it('lists failed runs under Needs you from the counts when the API has no feed', async () => {
        renderOverview({ failed: 3 });
        const needs = (await screen.findByText('Needs you', { selector: 'h2' })).closest('section') as HTMLElement;
        expect(await within(needs).findByText('3 workflow runs failed')).toBeInTheDocument();
    });

    it('lists the feed rows marked error or warning under Needs you', async () => {
        renderOverview({
            failed: 0,
            activity: [
                { id: 'r1', at: new Date().toISOString(), kind: 'run.failed', severity: 'error', actor: { kind: 'system', name: 'System' }, subject: { kind: 'workflow-run', id: 'r1', title: 'Notify Slack' }, text: 'A workflow run failed.', ref: '/workflow-runs?run=r1' },
                { id: 'p1', at: new Date().toISOString(), kind: 'published', severity: 'info', text: 'Published an entry.' },
            ],
        });
        const needs = (await screen.findByText('Needs you', { selector: 'h2' })).closest('section') as HTMLElement;
        expect(await within(needs).findByText('A workflow run failed.')).toBeInTheDocument();
        expect(within(needs).queryByText('Published an entry.')).toBeNull();
        expect(within(needs).getByRole('link')).toHaveAttribute('href', '/workflow-runs?run=r1');
    });
});
