import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let state: { rows: { key: string; title: string; detail: string; href: string; dot: string }[]; source: 'activity' | 'counts'; isLoading: boolean; isError: boolean };

vi.mock('@/hooks/use-needs-you', () => ({ useNeedsYou: () => state }));

const { NeedsYouCard } = await import('./needs-you-card');

const row = (key: string) => ({ key, title: `Row ${key}`, detail: 'detail', href: `/x/${key}`, dot: 'bg-warning' });

beforeEach(() => {
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
