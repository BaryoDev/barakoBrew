import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let summary: unknown;
vi.mock('@/hooks/use-overview-summary', () => ({ useOverviewSummary: () => ({ summary }) }));

const { GlanceCard } = await import('./glance-card');

beforeEach(() => {
    summary = undefined;
});

describe('Today at a glance', () => {
    it('lists the API items in the order it sent them, each linking to where it goes', () => {
        summary = {
            verdict: 'bad',
            headline: '2 problems',
            needsYou: [
                { id: 'runner.stalled', severity: 'bad', text: 'The runner stopped.', ref: { kind: 'runner' }, resolvable: false },
                { id: 'mail.bounces', severity: 'warn', text: '2 email bounces to look at.', ref: { kind: 'mailBounces' }, resolvable: true },
            ],
        };
        render(<GlanceCard />);
        const links = screen.getAllByRole('link');
        expect(links.map((l) => l.textContent)).toEqual(['The runner stopped.', '2 email bounces to look at.']);
        expect(links[1]).toHaveAttribute('href', '/email-events');
        expect(screen.getByText('Read straight from the API, in the order that matters.')).toBeInTheDocument();
    });

    it('says nothing is waiting when the list is empty', () => {
        summary = { verdict: 'ok', headline: 'All systems normal', needsYou: [] };
        render(<GlanceCard />);
        expect(screen.getByText('All systems normal. Nothing is waiting on you.')).toBeInTheDocument();
    });

    it('renders nothing against a core without GET /api/overview', () => {
        const { container } = render(<GlanceCard />);
        expect(container).toBeEmptyDOMElement();
    });

    it('has no AI wording', () => {
        summary = { verdict: 'ok', headline: 'All systems normal', needsYou: [] };
        render(<GlanceCard />);
        expect(document.body.textContent).not.toMatch(/\bAI\b|brief|Barako/i);
    });
});
