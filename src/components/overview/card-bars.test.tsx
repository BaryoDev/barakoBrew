import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardBars } from './card-bars';

const bars = (items: { label: string; value: number }[]) => ({ label: 'Wettest towns', items });

describe('CardBars', () => {
    it('scales bars to the largest', () => {
        render(<CardBars bars={bars([{ label: 'Oslo', value: 13 }, { label: 'Bergen', value: 10 }, { label: 'Tromso', value: 0 }])} />);
        const widths = screen.getAllByTestId('card-bar').map((bar) => (bar as HTMLElement).style.width);
        expect(widths).toEqual(['100%', '77%', '0%']);
        expect(screen.getByText('13')).toBeInTheDocument();
    });

    it('all zero values give zero-length bars and no NaN', () => {
        const { container } = render(<CardBars bars={bars([{ label: 'Oslo', value: 0 }, { label: 'Bergen', value: 0 }])} />);
        const widths = screen.getAllByTestId('card-bar').map((bar) => (bar as HTMLElement).style.width);
        expect(widths).toEqual(['0%', '0%']);
        expect(container.innerHTML).not.toContain('NaN');
    });

    it('draws markup as literal text', () => {
        const bomb = '<img src=x onerror=alert(1)>';
        const { container } = render(<CardBars bars={bars([{ label: bomb, value: 1 }, { label: 'x'.repeat(60), value: 2 }])} />);
        expect(screen.getByText(bomb)).toBeInTheDocument();
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('a')).toBeNull();
    });
});
