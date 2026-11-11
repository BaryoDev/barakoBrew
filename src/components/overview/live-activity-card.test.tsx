import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

type Item = { id: string; at: string; kind: string; severity?: string; actor?: { name: string }; subject?: { title: string }; text?: string; ref?: string };

let feed: { items: Item[]; available: boolean; isLoading: boolean; isError: boolean; dataUpdatedAt: number; refetch: () => void };

vi.mock('@/hooks/use-activity', () => ({ useActivity: () => feed }));

const { LiveActivityCard } = await import('./live-activity-card');

const at = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000).toISOString();
const base = { available: true, isLoading: false, isError: false, dataUpdatedAt: Date.now(), refetch: vi.fn() };

beforeEach(() => {
    feed = { ...base, items: [] };
});

describe('the Live activity card', () => {
    it('lists the rows with who, what, the subject and the kind', () => {
        feed = {
            ...base,
            items: [
                { id: 'a', at: at(120), kind: 'published', severity: 'info', actor: { name: 'Ana' }, subject: { title: 'New pastry menu' }, text: 'Published an entry.', ref: '/content/1' },
                { id: 'b', at: at(7200), kind: 'quota.reached', actor: { name: 'System' }, text: 'Something happened.' },
            ],
        };
        render(<LiveActivityCard />);
        const list = screen.getByRole('list', { name: 'Recent activity' });
        const rows = within(list).getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('2 min');
        // The sentence is built from kind, actor and subject title, so the text carries no title twice.
        expect(rows[0]).toHaveTextContent('Ana published New pastry menu');
        expect(rows[0]).not.toHaveTextContent('Published an entry.');
        expect(within(rows[0]).getAllByText('published').some((e) => e.className.includes('font-mono'))).toBe(true);
        expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/content/1');
        // An unknown kind is drawn as its name, in mono.
        expect(within(rows[1]).getByText('quota.reached').className).toContain('font-mono');
        expect(screen.queryByText(/677/)).toBeNull();
    });

    it('shows a subject title as text, not markup', () => {
        feed = { ...base, items: [{ id: 'a', at: at(5), kind: 'edited', actor: { name: 'Ana' }, subject: { title: '<img src=x onerror=alert(1)>' }, text: 'Edited an entry.' }] };
        const { container } = render(<LiveActivityCard />);
        expect(container.querySelector('img')).toBeNull();
        expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    });

    it('does not link a ref that leaves the console', () => {
        feed = { ...base, items: [{ id: 'a', at: at(5), kind: 'edited', actor: { name: 'Ana' }, text: 'Edited an entry.', ref: 'https://evil.example' }] };
        render(<LiveActivityCard />);
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('holds the rows still while paused, and follows again on Live', () => {
        feed = { ...base, items: [{ id: 'a', at: at(5), kind: 'edited', actor: { name: 'Ana' }, text: 'Edited an entry.' }] };
        const { rerender } = render(<LiveActivityCard />);
        const toggle = screen.getByRole('switch', { name: 'Live activity updates' });
        expect(toggle).toHaveTextContent('Live');

        fireEvent.click(toggle);
        expect(screen.getByRole('switch', { name: 'Live activity updates' })).toHaveTextContent('Paused');

        feed = { ...base, items: [{ id: 'b', at: at(1), kind: 'published', actor: { name: 'Marco' }, text: 'Published an entry.' }, ...feed.items] };
        rerender(<LiveActivityCard />);
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
        expect(screen.queryByText(/Marco/)).toBeNull();

        fireEvent.click(screen.getByRole('switch', { name: 'Live activity updates' }));
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        expect(screen.getByText(/Marco/)).toBeInTheDocument();
    });

    it('points at the audit log, with no ticket number, when the API has no feed', () => {
        feed = { ...base, available: false, items: [] };
        render(<LiveActivityCard />);
        expect(screen.getByRole('link', { name: 'audit log' })).toHaveAttribute('href', '/audit');
        expect(screen.queryByRole('switch')).toBeNull();
        expect(screen.queryByText(/677|not available yet/)).toBeNull();
    });

    it('says so when the feed fails and offers a retry', () => {
        feed = { ...base, isError: true, items: [] };
        render(<LiveActivityCard />);
        expect(screen.getByRole('alert')).toHaveTextContent('Activity could not be loaded.');
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(base.refetch).toHaveBeenCalled();
    });

    it('says nothing has happened yet on an empty feed', () => {
        render(<LiveActivityCard />);
        expect(screen.getByText(/Nothing has happened yet/)).toBeInTheDocument();
    });
});
