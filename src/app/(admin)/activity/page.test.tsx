import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

type Item = { id: string; at: string; kind: string; severity?: string; actor?: { name: string }; subject?: { title: string }; text?: string; ref?: string };

const feed = vi.hoisted(() => ({
    value: { items: [] as Item[], available: true, missing: false, isLoading: false, isError: false, dataUpdatedAt: 0, refetch: () => {} },
    calls: [] as { live?: boolean; kinds?: readonly string[] }[],
}));

vi.mock('@/hooks/use-activity', () => ({
    useActivity: (opts: { live?: boolean; kinds?: readonly string[] }) => {
        feed.calls.push(opts);
        return feed.value;
    },
}));

const { default: ActivityPage } = await import('./page');

const at = (s: number) => new Date(Date.now() - s * 1000).toISOString();
const last = () => feed.calls[feed.calls.length - 1];

beforeEach(() => {
    feed.calls = [];
    feed.value = { items: [], available: true, missing: false, isLoading: false, isError: false, dataUpdatedAt: Date.now(), refetch: () => {} };
});

describe('the Activity screen', () => {
    it('offers the six filter chips and asks for no kinds at first', () => {
        render(<ActivityPage />);
        for (const name of ['Everything', 'Problems', 'Publishing', 'Workflow runs', 'Sign-ins', 'Imports']) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument();
        }
        expect(screen.getByRole('button', { name: /Everything/ })).toHaveAttribute('aria-pressed', 'true');
        expect(last().kinds).toEqual([]);
    });

    it('sends the chip kinds when a chip is picked', () => {
        render(<ActivityPage />);
        fireEvent.click(screen.getByRole('button', { name: 'Problems' }));
        expect(last().kinds).toEqual(['run.failed', 'bounced']);
        fireEvent.click(screen.getByRole('button', { name: 'Sign-ins' }));
        expect(last().kinds).toEqual(['signin']);
    });

    it('is Live, then Paused stops the poll', () => {
        render(<ActivityPage />);
        expect(last().live).toBe(true);
        fireEvent.click(screen.getByRole('switch', { name: 'Live activity updates' }));
        expect(screen.getByRole('switch', { name: 'Live activity updates' })).toHaveTextContent('Paused');
        expect(last().live).toBe(false);
    });

    it('draws each row from kind, actor and subject title', () => {
        feed.value = {
            ...feed.value,
            items: [
                { id: 'a', at: at(120), kind: 'published', actor: { name: 'Ana' }, subject: { title: 'New pastry menu' }, text: 'Published an entry.' },
                { id: 'b', at: at(60), kind: 'quota.reached', actor: { name: 'System' }, text: 'Something happened.' },
            ],
        };
        render(<ActivityPage />);
        const rows = within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem');
        expect(rows[0]).toHaveTextContent('Ana published New pastry menu');
        expect(within(rows[1]).getByText('quota.reached').className).toContain('font-mono');
    });

    it('points at the audit log when the API has no feed', () => {
        feed.value = { ...feed.value, available: false, missing: true };
        render(<ActivityPage />);
        expect(screen.getByRole('link', { name: 'audit log' })).toHaveAttribute('href', '/audit');
        expect(screen.queryByRole('switch')).toBeNull();
    });
});
