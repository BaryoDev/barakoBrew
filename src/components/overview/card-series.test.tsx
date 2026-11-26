import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CardSeries } from './card-series';
import type { ModuleCardSeries } from '@/lib/module-cards';

const series = (over: Partial<ModuleCardSeries> = {}): ModuleCardSeries => ({
    label: 'This week',
    previousLabel: 'Last week',
    points: [
        { date: '2026-11-19', value: 5, previous: 8 },
        { date: '2026-11-20', value: 9, previous: 4 },
        { date: '2026-11-21', value: 7, previous: 6 },
    ],
    ...over,
});

describe('CardSeries', () => {
    it('draws a dashed previous line and a legend', () => {
        const { container } = render(<CardSeries series={series()} />);
        expect(screen.getByTestId('previous-line')).toBeInTheDocument();
        expect(screen.getAllByText('Last week').length).toBeGreaterThan(0);
        expect(container.querySelector('p .border-dashed')).not.toBeNull();
    });

    it('draws no previous line and no legend without previous values', () => {
        render(
            <CardSeries
                series={series({ previousLabel: undefined, points: [{ date: '2026-11-19', value: 1 }, { date: '2026-11-20', value: 2 }] })}
            />,
        );
        expect(screen.queryByTestId('previous-line')).toBeNull();
        expect(screen.queryByText('Last week')).toBeNull();
    });

    it('exposes the numbers in a hidden table', () => {
        render(<CardSeries series={series()} />);
        const table = screen.getByRole('table');
        expect(table.className).toContain('sr-only');
        expect(within(table).getByText('2026-11-20')).toBeInTheDocument();
        expect(within(table).getAllByRole('row')).toHaveLength(4);
        expect(within(table).getByText('9')).toBeInTheDocument();
        expect(within(table).getByText('4')).toBeInTheDocument();
    });

    it('shows the tooltip on focus with date, this and last', () => {
        render(<CardSeries series={series()} />);
        expect(screen.queryByTestId('card-series-tip')).toBeNull();
        fireEvent.focus(screen.getByLabelText('2026-11-20: 9'));
        const tip = screen.getByTestId('card-series-tip');
        expect(tip).toHaveTextContent('2026-11-20');
        expect(tip).toHaveTextContent('This week: 9');
        expect(tip).toHaveTextContent('Last week: 4');
        fireEvent.blur(screen.getByLabelText('2026-11-20: 9'));
        expect(screen.queryByTestId('card-series-tip')).toBeNull();
    });

    it('shows the tooltip on hover', () => {
        render(<CardSeries series={series()} />);
        fireEvent.mouseEnter(screen.getByLabelText('2026-11-19: 5'));
        expect(screen.getByTestId('card-series-tip')).toHaveTextContent('This week: 5');
    });

    it('keeps the tooltip out of the pointer path and the screen reader', () => {
        render(<CardSeries series={series()} />);
        fireEvent.mouseEnter(screen.getByLabelText('2026-11-19: 5'));
        const tip = screen.getByTestId('card-series-tip');
        expect(tip).toHaveClass('pointer-events-none');
        expect(tip).toHaveAttribute('aria-hidden', 'true');
        expect(tip).not.toHaveAttribute('role');
    });

    it('draws an all-zero series with finite coordinates', () => {
        const zero = [0, 1, 2].map((i) => ({ date: `2026-11-2${i}`, value: 0, previous: 0 }));
        const { container } = render(<CardSeries series={series({ points: zero })} />);
        for (const path of Array.from(container.querySelectorAll('path'))) {
            expect(path.getAttribute('d')).not.toContain('NaN');
            expect(path.getAttribute('d')).not.toContain('Infinity');
        }
        expect(container.innerHTML).not.toContain('NaN');
    });

    it('draws markup as literal text', () => {
        const bomb = '<img src=x onerror=alert(1)>';
        const { container } = render(<CardSeries series={series({ label: bomb, previousLabel: 'x'.repeat(60) })} />);
        expect(screen.getAllByText(bomb).length).toBeGreaterThan(0);
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('a')).toBeNull();
    });
});
