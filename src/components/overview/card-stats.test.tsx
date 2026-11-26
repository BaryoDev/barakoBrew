import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardStats } from './card-stats';
import type { ModuleCardStat } from '@/lib/module-cards';

const stat = (over: Partial<ModuleCardStat> = {}): ModuleCardStat => ({ label: 'Rainfall', value: 69, format: 'count', ...over });

describe('CardStats', () => {
    it('shows an up arrow and the signed percent', () => {
        const { container } = render(<CardStats stats={[stat({ value: 120, previous: 100 })]} />);
        expect(screen.getByText('+20%')).toBeInTheDocument();
        expect(screen.getByText('Up')).toBeInTheDocument();
        expect(container.querySelector('svg.lucide-arrow-up')).not.toBeNull();
    });

    it('shows a down arrow and a negative percent', () => {
        const { container } = render(<CardStats stats={[stat({ value: 69, previous: 78 })]} />);
        expect(screen.getByText('-12%')).toBeInTheDocument();
        expect(screen.getByText('Down')).toBeInTheDocument();
        expect(container.querySelector('svg.lucide-arrow-down')).not.toBeNull();
    });

    it('colours only with goodWhen and never by colour alone', () => {
        const { container } = render(
            <CardStats
                stats={[
                    stat({ label: 'Plain', value: 120, previous: 100 }),
                    stat({ label: 'Good up', value: 120, previous: 100, goodWhen: 'up' }),
                    stat({ label: 'Bad up', value: 120, previous: 100, goodWhen: 'down' }),
                ]}
            />,
        );
        const changes = Array.from(container.querySelectorAll('li')).map((li) => li.querySelector('span.flex')!);
        expect(changes[0].className).toContain('text-muted-foreground');
        expect(changes[1].className).toContain('text-success');
        expect(changes[2].className).toContain('text-destructive');
        for (const change of changes) {
            expect(change.textContent).toContain('+20%');
            expect(change.querySelector('svg')).not.toBeNull();
        }
    });

    it.each([
        ['missing', undefined],
        ['zero', 0],
    ])('shows no change when previous is %s', (_name, previous) => {
        const { container } = render(<CardStats stats={[stat({ previous })]} />);
        expect(screen.queryByText(/%/)).toBeNull();
        expect(container.querySelector('svg')).toBeNull();
    });

    it('reads 5 of 5 for total', () => {
        // The total is its own span inside the value, so the pair is read from the tile's text.
        render(<CardStats stats={[stat({ label: 'Gauges', value: 5, total: 5 })]} />);
        expect(screen.getByTestId('card-stats').textContent).toMatch(/\b5 of 5\b/);
    });

    it('formats percent', () => {
        render(<CardStats stats={[stat({ label: 'Sunny days', value: 97, format: 'percent' })]} />);
        expect(screen.getByText('97%')).toBeInTheDocument();
    });

    it('draws zero values with no change and no NaN', () => {
        const { container } = render(<CardStats stats={[stat({ value: 0, previous: 0 })]} />);
        expect(container.textContent).not.toContain('NaN');
    });

    it('draws markup as literal text', () => {
        const bomb = '<img src=x onerror=alert(1)>';
        const { container } = render(<CardStats stats={[stat({ label: bomb })]} />);
        expect(screen.getByText(bomb)).toBeInTheDocument();
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('a')).toBeNull();
    });
});
