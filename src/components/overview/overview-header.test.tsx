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
vi.mock('@/hooks/use-needs-you', () => ({ useNeedsYou: () => needs }));

const { OverviewHeader } = await import('./overview-header');

const healthy = { postgres: { status: 'Healthy', duration: '00:00:00.004' }, storage: { status: 'Healthy', duration: '00:00:00.01' } };

beforeEach(() => {
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
