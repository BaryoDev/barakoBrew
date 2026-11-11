import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let needs: { rows: { key: string; decision?: boolean }[]; isLoading: boolean; isError: boolean };
let entries: Record<string, { status: string; duration: string }> | undefined;

vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { userId: 'u1', username: 'ana_reyes', roles: ['Admin'] } }) }));
vi.mock('@/hooks/use-tenants', () => ({
    useCurrentTenant: () => 'cafe',
    useMyTenants: () => ({ data: [{ slug: 'cafe', name: 'Kape Cafe' }] }),
}));
vi.mock('@/hooks/use-monitoring', () => ({ useHealthStatus: () => ({ data: entries ? { entries } : undefined }) }));
let overview: { summary?: unknown; unavailable: boolean; isLoading: boolean; isError: boolean };
vi.mock('@/hooks/use-overview-summary', () => ({ useOverviewSummary: () => overview }));
vi.mock('@/hooks/use-needs-you', () => ({ useNeedsYou: () => needs }));

const { OverviewHeader } = await import('./overview-header');

const healthy = { postgres: { status: 'Healthy', duration: '00:00:00.004' }, storage: { status: 'Healthy', duration: '00:00:00.01' } };

beforeEach(() => {
    overview = { unavailable: true, isLoading: false, isError: false };
    needs = { rows: [], isLoading: false, isError: false };
    entries = healthy;
});

describe('the Overview heading', () => {
    it('is 32px at -0.035em with the tenant and the date above it', () => {
        render(<OverviewHeader range={30} onRange={() => {}} />);
        const h1 = screen.getByRole('heading', { level: 1 });
        expect(h1.className).toContain('text-[32px]');
        expect(h1.className).toContain('tracking-[-0.035em]');
        expect(h1.textContent).toMatch(/^Good (morning|afternoon|evening), Ana$/);
        expect(screen.getByText(/^Kape Cafe · \w+day \d+ \w+$/)).toBeInTheDocument();
    });

    it('says the site is up and nothing waits, with a green dot', () => {
        render(<OverviewHeader range={30} onRange={() => {}} />);
        expect(screen.getByRole('status')).toHaveTextContent('Your site is up and nothing is waiting on you.');
        expect(screen.getByTestId('verdict-dot').className).toContain('bg-success');
    });

    it('names a decision only the reader can make, with a red dot', () => {
        needs = { rows: [{ key: 'runs', decision: true }, { key: 'bounces' }], isLoading: false, isError: false };
        render(<OverviewHeader range={30} onRange={() => {}} />);
        expect(screen.getByRole('status')).toHaveTextContent('Your site is up. 2 things need you, one of them a decision only you can make.');
        expect(screen.getByTestId('verdict-dot').className).toContain('bg-destructive');
    });

    it('uses an amber dot when what waits is not a decision', () => {
        needs = { rows: [{ key: 'bounces' }], isLoading: false, isError: false };
        render(<OverviewHeader range={30} onRange={() => {}} />);
        expect(screen.getByRole('status')).toHaveTextContent('Your site is up. 1 thing needs you.');
        expect(screen.getByTestId('verdict-dot').className).toContain('bg-warning');
    });

    it('says nothing while Needs you is still loading', () => {
        needs = { rows: [], isLoading: true, isError: false };
        render(<OverviewHeader range={30} onRange={() => {}} />);
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('does not claim the site is up when the database check is not healthy', () => {
        entries = { ...healthy, postgres: { status: 'Unhealthy', duration: '00:00:00' } };
        render(<OverviewHeader range={30} onRange={() => {}} />);
        expect(screen.getByRole('status')).toHaveTextContent('Part of the system is not healthy.');
        expect(screen.getByTestId('verdict-dot').className).toContain('bg-destructive');
    });
});

describe('the Overview verdict from GET /api/overview', () => {
    it('takes the dot and the words from the API, not from the page', () => {
        // The page's own reads say all is well. Only the API says warn, so a warn dot proves the source.
        needs = { rows: [{ key: 'mail.bounces' }], isLoading: false, isError: false };
        overview = {
            summary: { verdict: 'warn', headline: '1 warning', health: { items: [] }, needsYou: [{ id: 'mail.bounces' }] },
            unavailable: false,
            isLoading: false,
            isError: false,
        };
        render(<OverviewHeader range={30} onRange={() => {}} />);
        expect(screen.getByRole('status')).toHaveTextContent('1 warning. 1 thing needs you.');
        expect(screen.getByTestId('verdict-dot').className).toContain('bg-warning');
    });

    it('uses a red dot when the API says bad', () => {
        overview = { summary: { verdict: 'bad', headline: '2 problems', health: { items: [] }, needsYou: [] }, unavailable: false, isLoading: false, isError: false };
        render(<OverviewHeader range={30} onRange={() => {}} />);
        expect(screen.getByRole('status')).toHaveTextContent('2 problems. Nothing is waiting on you.');
        expect(screen.getByTestId('verdict-dot').className).toContain('bg-destructive');
    });

    it('counts the rows Needs you shows, not the API list', () => {
        // The API lists one item and the card shows that one plus a client errors row.
        needs = { rows: [{ key: 'mail.bounces' }, { key: 'errors' }], isLoading: false, isError: false };
        overview = {
            summary: { verdict: 'warn', headline: '1 warning', health: { items: [] }, needsYou: [{ id: 'mail.bounces' }] },
            unavailable: false,
            isLoading: false,
            isError: false,
        };
        render(<OverviewHeader range={30} onRange={() => {}} />);
        expect(screen.getByRole('status')).toHaveTextContent('1 warning. 2 things need you.');
    });

    it('does not say the site is up when core sent no health', () => {
        overview = { summary: { verdict: 'ok', headline: 'All systems normal', health: null, needsYou: [] }, unavailable: false, isLoading: false, isError: false };
        render(<OverviewHeader range={30} onRange={() => {}} />);
        expect(screen.getByRole('status')).toHaveTextContent(/^Nothing is waiting on you\.$/);
    });

    it('says nothing while the API has not answered', () => {
        overview = { unavailable: false, isLoading: true, isError: false };
        render(<OverviewHeader range={30} onRange={() => {}} />);
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('falls back to the page verdict when the API errors', () => {
        overview = { unavailable: false, isLoading: false, isError: true };
        render(<OverviewHeader range={30} onRange={() => {}} />);
        expect(screen.getByRole('status')).toHaveTextContent('Your site is up and nothing is waiting on you.');
    });
});

