import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

let state: { rows: { key: string; title: string; detail: string; href: string; dot: string; cta?: 'Review' | 'Open'; resolveId?: string }[]; source: 'activity' | 'counts'; isLoading: boolean; isError: boolean };

vi.mock('@/hooks/use-needs-you', async () => {
    const { useSyncExternalStore } = await import('react');
    const store = await import('@/lib/pending-resolves');
    return {
        useNeedsYou: () => {
            const pending = useSyncExternalStore(store.subscribePending, store.pendingIds, store.pendingIds);
            return { ...state, rows: state.rows.filter((r) => !(r.resolveId && pending.has(r.resolveId))) };
        },
    };
});
let tenant: string | null = 'a';
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => tenant }));
// The token is the tenant here, so a test switches tenant by changing it.
const tokens = { token: 'a' as string | null };
vi.mock('@/lib/api', () => ({ tokenStore: tokens, tenantOfToken: (t: string | null) => t }));
const resolve = vi.fn();
vi.mock('@/hooks/use-overview-summary', () => ({ useResolveOverviewItem: () => ({ mutateAsync: resolve }) }));
const toastFn = Object.assign(vi.fn(() => 'toast-1'), { error: vi.fn(), dismiss: vi.fn() });
vi.mock('sonner', () => ({ toast: toastFn }));

const { NeedsYouCard } = await import('./needs-you-card');
const { release } = await import('@/lib/pending-resolves');

const row = (key: string) => ({ key, title: `Row ${key}`, detail: 'detail', href: `/x/${key}`, dot: 'bg-warning' });

beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    resolve.mockResolvedValue(undefined);
    tenant = 'a';
    tokens.token = 'a';
    release('mail.bounces');
    state = { rows: [], source: 'activity', isLoading: false, isError: false };
});

describe('the Needs you card', () => {
    it('lists each row as a link to where it opens, with the count in the head', () => {
        state.rows = [row('a'), row('b')];
        render(<NeedsYouCard />);
        expect(screen.getByRole('link', { name: /Row a/ })).toHaveAttribute('href', '/x/a');
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('drops the barakoCMS#677 placeholder', () => {
        render(<NeedsYouCard />);
        expect(screen.queryByText(/677|not available yet/)).toBeNull();
    });

    it('says all clear when the feed has nothing for you', () => {
        render(<NeedsYouCard />);
        expect(screen.getByText('All clear. Nothing is waiting on you.')).toBeInTheDocument();
    });

    it('keeps the older wording against an API without the feed', () => {
        state.source = 'counts';
        render(<NeedsYouCard />);
        expect(screen.getByText('Nothing from runs, errors or email is waiting on you.')).toBeInTheDocument();
    });

    it('shows the first six and says how many more', () => {
        state.rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(row);
        render(<NeedsYouCard />);
        expect(screen.getAllByRole('link', { name: /Row / })).toHaveLength(6);
        expect(screen.getByText(/and 2 more/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open the audit log' })).toHaveAttribute('href', '/audit');
    });

    it('reports a load failure', () => {
        state.isError = true;
        render(<NeedsYouCard />);
        expect(screen.getByRole('alert')).toHaveTextContent('Needs you could not be loaded.');
    });
});

describe('a Needs you row from the API', () => {
    const bounce = { ...row('mail.bounces'), title: '2 email bounces to look at.', cta: 'Review' as const, resolveId: 'mail.bounces' };

    it('says Review or Open on its own button and links to where it goes', () => {
        state.rows = [bounce, { ...row('content.overdue'), cta: 'Open' as const }];
        render(<NeedsYouCard />);
        expect(screen.getByRole('link', { name: /^Review:/ })).toHaveAttribute('href', '/x/mail.bounces');
        expect(screen.getByRole('link', { name: /^Open: Row content.overdue/ })).toBeInTheDocument();
    });

    it('offers a check mark only where core can resolve', () => {
        state.rows = [bounce, row('workflows.failing')];
        render(<NeedsYouCard />);
        expect(screen.getAllByRole('button', { name: /Mark resolved/ })).toHaveLength(1);
    });

    it('hides the row, offers Undo, and sends the resolve after the undo window', () => {
        vi.useFakeTimers();
        state.rows = [bounce];
        render(<NeedsYouCard />);
        fireEvent.click(screen.getByRole('button', { name: /Mark resolved/ }));
        expect(screen.queryByRole('link', { name: /^Review:/ })).toBeNull();
        expect(toastFn.mock.calls[0][1].action.label).toBe('Undo');
        expect(resolve).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(6000);
        });
        expect(resolve).toHaveBeenCalledTimes(1);
        expect(resolve.mock.calls[0][0]).toBe('mail.bounces');
        expect(toastFn.dismiss).toHaveBeenCalledWith('toast-1');
    });

    it('brings the row back and sends nothing when Undo is pressed', () => {
        vi.useFakeTimers();
        state.rows = [bounce];
        render(<NeedsYouCard />);
        fireEvent.click(screen.getByRole('button', { name: /Mark resolved/ }));
        act(() => toastFn.mock.calls[0][1].action.onClick());
        act(() => {
            vi.advanceTimersByTime(10_000);
        });
        expect(screen.getByRole('link', { name: /^Review:/ })).toBeInTheDocument();
        expect(resolve).not.toHaveBeenCalled();
    });

    it('does nothing when Undo is pressed after the call went out', async () => {
        vi.useFakeTimers();
        resolve.mockReturnValue(new Promise(() => {}));
        state.rows = [bounce];
        render(<NeedsYouCard />);
        fireEvent.click(screen.getByRole('button', { name: /Mark resolved/ }));
        act(() => {
            vi.advanceTimersByTime(6000);
        });
        act(() => toastFn.mock.calls[0][1].action.onClick());
        expect(screen.queryByRole('link', { name: /^Review:/ })).toBeNull();
    });

    it('lets a later row with the same id show again once the call succeeded', async () => {
        vi.useFakeTimers();
        state.rows = [bounce];
        render(<NeedsYouCard />);
        fireEvent.click(screen.getByRole('button', { name: /Mark resolved/ }));
        await act(async () => {
            vi.advanceTimersByTime(6000);
        });
        expect(screen.getByRole('link', { name: /^Review:/ })).toBeInTheDocument();
    });

    it('drops a held resolve unsent when the tenant changes', () => {
        vi.useFakeTimers();
        state.rows = [bounce];
        const { rerender } = render(<NeedsYouCard />);
        fireEvent.click(screen.getByRole('button', { name: /Mark resolved/ }));
        tenant = 'b';
        tokens.token = 'b';
        rerender(<NeedsYouCard />);
        act(() => {
            vi.advanceTimersByTime(10_000);
        });
        expect(resolve).not.toHaveBeenCalled();
        expect(screen.getByRole('link', { name: /^Review:/ })).toBeInTheDocument();
    });

    it('does not send as someone else when the token changed before the timer', () => {
        vi.useFakeTimers();
        state.rows = [bounce];
        render(<NeedsYouCard />);
        fireEvent.click(screen.getByRole('button', { name: /Mark resolved/ }));
        tokens.token = null; // signed out
        act(() => {
            vi.advanceTimersByTime(6000);
        });
        expect(resolve).not.toHaveBeenCalled();
    });
});
