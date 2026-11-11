import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { StatCards } = await import('./stat-cards');
const { RangeSwitch } = await import('./overview-header');
import type { Range } from '@/lib/overview';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const daysAgo = (d: number) => ({ createdAt: new Date(NOW - d * 86_400_000).toISOString() });

interface Lists {
    published: unknown[];
    drafts: unknown[];
    runs: unknown[];
    failed: unknown[];
    partial?: unknown[];
    totals?: { published?: number; drafts?: number; runs?: number; failed?: number };
    failing?: 'published' | 'runs';
}

function answer(l: Lists) {
    vi.mocked(api.get).mockImplementation(async (url: string, config?: { params?: unknown }) => {
        const status = (config?.params as { status?: unknown } | undefined)?.status;
        const pick = (items: unknown[], total?: number) => ({
            data: { items, totalItems: total ?? items.length, page: 1, pageSize: 100, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
        });
        if (url === '/api/contents') {
            if (status === 'Published') {
                if (l.failing === 'published') throw new Error('boom');
                return pick(l.published, l.totals?.published);
            }
            return pick(l.drafts, l.totals?.drafts);
        }
        if (url === '/api/workflow-runs') {
            if (status === 'Failed') return pick(l.failed, l.totals?.failed);
            if (status === 'PartiallyFailed') return pick(l.partial ?? []);
            if (l.failing === 'runs') throw new Error('boom');
            return pick(l.runs, l.totals?.runs);
        }
        throw new Error(`unexpected ${url}`);
    });
}

function renderCards(range: Range) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <StatCards range={range} now={NOW} />
        </QueryClientProvider>,
    );
}

const card = async (label: string) => (await screen.findByText(label)).closest('a') as HTMLElement;

beforeEach(() => vi.clearAllMocks());

describe('the stat cards', () => {
    it('show the totals the API reports for each list', async () => {
        answer({ published: [daysAgo(1)], drafts: [daysAgo(1)], runs: [daysAgo(1)], failed: [], totals: { published: 42, drafts: 5, runs: 318, failed: 0 } });
        renderCards(30);
        expect(await within(await card('Published')).findByText('42')).toBeInTheDocument();
        expect(await within(await card('Drafts')).findByText('5')).toBeInTheDocument();
        expect(await within(await card('Workflow runs')).findByText('318')).toBeInTheDocument();
        expect(await within(await card('Failures')).findByText('0')).toBeInTheDocument();
    });

    it('ask for one bounded page of each list and nothing else', async () => {
        answer({ published: [], drafts: [], runs: [], failed: [] });
        renderCards(30);
        await within(await card('Published')).findByText('0');
        const calls = vi.mocked(api.get).mock.calls;
        expect(calls).toHaveLength(5);
        for (const [, config] of calls) {
            expect((config as { params: { pageSize: number } }).params.pageSize).toBe(100);
        }
    });

    it('mark Failures as needing attention only when there are failures', async () => {
        answer({ published: [], drafts: [], runs: [], failed: [daysAgo(1), daysAgo(2)] });
        const first = renderCards(30);
        const failures = await card('Failures');
        expect(await within(failures).findByText('2 for you')).toBeInTheDocument();
        first.unmount();

        answer({ published: [], drafts: [], runs: [], failed: [] });
        renderCards(30);
        expect(await within(await card('Failures')).findByText('None')).toBeInTheDocument();
        expect(screen.queryByText(/for you/)).not.toBeInTheDocument();
    });

    it('draw twelve bars and the change against the range before, as a sentence', async () => {
        // 18 in the last 7 days, 12 in the 7 before: +50% vs prior.
        const published = [
            ...Array.from({ length: 18 }, (_, i) => daysAgo(1 + (i % 5))),
            ...Array.from({ length: 12 }, (_, i) => daysAgo(8 + (i % 5))),
        ];
        answer({ published, drafts: [], runs: [], failed: [] });
        renderCards(7);
        const published_ = await card('Published');
        expect(await within(published_).findByText('+50% vs prior')).toBeInTheDocument();
        expect(within(published_).getByTestId('spark').children).toHaveLength(12);
    });

    it('tell a small change as a count', async () => {
        // 3 in the last 7 days, 6 in the 7 before.
        const drafts = [daysAgo(1), daysAgo(2), daysAgo(3), ...[8, 9, 10, 11, 12, 13].map(daysAgo)];
        answer({ published: [], drafts, runs: [], failed: [] });
        renderCards(7);
        expect(await within(await card('Drafts')).findByText('3 fewer')).toBeInTheDocument();
    });

    it('leave the change figure out when the sample cannot reach back two ranges', async () => {
        vi.mocked(api.get).mockImplementation(async (_url: string, config?: { params?: unknown }) => ({
            data: {
                items: (config?.params as { status?: unknown } | undefined)?.status === 'Published' ? [daysAgo(1), daysAgo(2)] : [],
                totalItems: (config?.params as { status?: unknown } | undefined)?.status === 'Published' ? 500 : 0,
                page: 1,
                pageSize: 100,
                totalPages: 5,
                hasNextPage: (config?.params as { status?: unknown } | undefined)?.status === 'Published',
                hasPreviousPage: false,
            },
        }));
        renderCards(7);
        const published = await card('Published');
        expect(await within(published).findByText('500')).toBeInTheDocument();
        expect(within(published).queryByText(/vs prior|new|more|fewer/)).not.toBeInTheDocument();
    });

    it('show an error on the card that failed and leave the others alone', async () => {
        answer({ published: [], drafts: [], runs: [daysAgo(1)], failed: [], failing: 'published', totals: { drafts: 7 } });
        renderCards(30);
        expect(await within(await card('Published')).findByText('Could not load')).toBeInTheDocument();
        expect(await within(await card('Drafts')).findByText('7')).toBeInTheDocument();
    });
});

describe('the range switch', () => {
    function Harness() {
        const [range, setRange] = useState<Range>(30);
        return (
            <QueryClientProvider client={new QueryClient()}>
                <RangeSwitch value={range} onChange={setRange} />
            </QueryClientProvider>
        );
    }

    it('offers 7, 30 and 90 days with 30 selected', () => {
        render(<Harness />);
        const buttons = screen.getAllByRole('button');
        expect(buttons.map((b) => b.textContent)).toEqual(['7 days', '30 days', '90 days']);
        expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('moves the selection when another range is picked', () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole('button', { name: '90 days' }));
        expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('changes what the cards draw: the same rows land in different bars per range', async () => {
        // 10 days old: outside a 7 day range, inside 30.
        answer({ published: [daysAgo(10)], drafts: [], runs: [], failed: [] });
        const { unmount } = renderCards(7);
        const heightsOf = async () =>
            Array.from((await within(await card("Published")).findByTestId("spark")).children).map(
                (c) => (c as HTMLElement).style.height,
            );
        // Every bar sits at the floor for 7 days.
        expect(new Set(await heightsOf()).size).toBe(1);
        unmount();
        // One bar is raised for 30.
        renderCards(30);
        expect(new Set(await heightsOf()).size).toBe(2);
    });
});

describe('the stat card targets', () => {
    it('open the filtered screen each one names', async () => {
        answer({ published: [], drafts: [], runs: [], failed: [] });
        renderCards(30);
        await within(await card('Published')).findByText('0');
        expect(await card('Published')).toHaveAttribute('href', '/content?status=Published');
        expect(await card('Drafts')).toHaveAttribute('href', '/content?status=Draft');
        expect(await card('Workflow runs')).toHaveAttribute('href', '/workflow-runs');
        expect(await card('Failures')).toHaveAttribute('href', '/workflow-runs');
    });

    it('count Failed and Partly failed together in Failures', async () => {
        answer({ published: [], drafts: [], runs: [], failed: [daysAgo(1)], partial: [daysAgo(2), daysAgo(3)] });
        renderCards(30);
        const failures = await card('Failures');
        expect(await within(failures).findByText('3 for you')).toBeInTheDocument();
        expect(within(failures).getByText('3', { selector: 'span.font-display' })).toBeInTheDocument();
    });
});

