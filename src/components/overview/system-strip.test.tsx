import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

let entries: Record<string, { status: string; duration: string }> | undefined;
let metrics: Record<string, { value: number; atLeast: boolean }>;
let runs: { rows: { status: string }[] } | undefined;
let hrefs: string[];

let summary: unknown;
vi.mock('@/hooks/use-overview-summary', () => ({ useOverviewSummary: () => ({ summary, unavailable: !summary, isLoading: false, isError: false }) }));
vi.mock('@/hooks/use-meta', () => ({ useApiMeta: () => ({ data: { version: '5.4.0', swaggerEnabled: false } }) }));
vi.mock('@/hooks/use-monitoring', () => ({ useHealthStatus: () => ({ data: entries ? { entries } : undefined }) }));
vi.mock('@/hooks/use-nav-metrics', () => ({ useNavMetrics: () => metrics }));
vi.mock('@/hooks/use-overview', () => ({ useRunSample: () => ({ data: runs }) }));
vi.mock('@/hooks/use-visible-hrefs', () => ({
    useAllowedGroups: () => [{ items: hrefs.map((href) => ({ href })) }],
    hrefsOf: (groups: { items: { href: string }[] }[]) => new Set(groups.flatMap((g) => g.items.map((i) => i.href))),
}));

const { SystemStrip } = await import('./system-strip');

const healthy = { postgres: { status: 'Healthy', duration: '00:00:00.004' }, storage: { status: 'Healthy', duration: '00:00:00.01' } };

beforeEach(() => {
    summary = undefined;
    entries = healthy;
    metrics = { recentBounces: { value: 0, atLeast: false } };
    runs = { rows: [{ status: 'Succeeded' }] };
    hrefs = ['/email-events', '/workflow-runs'];
});

const strip = () => screen.getByRole('group', { name: 'System status' });

describe('the system strip', () => {
    it('leads with an All systems normal pill and has no Contract item', () => {
        render(<SystemStrip />);
        expect(within(strip()).getByRole('link', { name: 'All systems normal' })).toBeInTheDocument();
        expect(within(strip()).queryByText('Contract')).toBeNull();
        expect(strip().textContent).not.toMatch(/console speaks/);
    });

    it('lists API, Database, Storage, Mail and Runner', () => {
        render(<SystemStrip />);
        for (const label of ['API', 'Database', 'Storage', 'Mail', 'Runner']) {
            expect(within(strip()).getByText(label)).toBeInTheDocument();
        }
        expect(strip()).toHaveTextContent('up · 5.4.0');
        expect(strip()).toHaveTextContent('delivering');
        expect(strip()).toHaveTextContent('idle');
    });

    it('counts a bounce as a warning and says so on Mail', () => {
        metrics = { recentBounces: { value: 2, atLeast: false } };
        render(<SystemStrip />);
        expect(within(strip()).getByRole('link', { name: '1 warning' })).toHaveAttribute('href', '/email-events');
        expect(strip()).toHaveTextContent('2 bounces');
    });

    it('leaves Mail out when the caller cannot read email events', () => {
        metrics = {};
        render(<SystemStrip />);
        expect(within(strip()).queryByText('Mail')).toBeNull();
    });

    it('shows the Runner as running a workflow when a run is Running', () => {
        runs = { rows: [{ status: 'Running' }] };
        render(<SystemStrip />);
        expect(strip()).toHaveTextContent('running a workflow');
    });

    it('leaves the Runner out until the runs have loaded', () => {
        runs = undefined;
        render(<SystemStrip />);
        expect(within(strip()).queryByText('Runner')).toBeNull();
    });

    it('counts a degraded database as a warning', () => {
        entries = { ...healthy, postgres: { status: 'Degraded', duration: '00:00:00.4' } };
        render(<SystemStrip />);
        expect(within(strip()).getByRole('link', { name: '1 warning' })).toBeInTheDocument();
    });
});

describe('the system strip from GET /api/overview', () => {
    beforeEach(() => {
        // The page's own reads all say healthy. Only the API says Mail is off.
        summary = {
            verdict: 'warn',
            headline: '1 warning',
            needsYou: [],
            health: {
                verdict: 'warn',
                items: [
                    { name: 'API', status: 'ok', version: '5.4.0' },
                    { name: 'Database', status: 'ok', ms: 4 },
                    { name: 'Storage', status: 'ok' },
                    { name: 'Mail', status: 'warn', detail: '2 bounces waiting.' },
                    { name: 'Runner', status: 'ok' },
                ],
            },
        };
    });

    it('shows the headline as the pill and the plain words per item', () => {
        render(<SystemStrip />);
        expect(within(strip()).getByRole('link', { name: '1 warning' })).toBeInTheDocument();
        expect(strip()).toHaveTextContent('up · 5.4.0');
        expect(strip()).toHaveTextContent('4 ms');
        expect(strip()).toHaveTextContent('2 bounces waiting.');
    });

    it('carries the detail as the hover title and opens Email events from the pill', () => {
        render(<SystemStrip />);
        expect(within(strip()).getByText('Mail').closest('a')).toHaveAttribute('title', '2 bounces waiting.');
        expect(within(strip()).getByRole('link', { name: '1 warning' })).toHaveAttribute('href', '/email-events');
    });
});

