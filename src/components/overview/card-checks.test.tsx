import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardChecks } from './card-checks';

describe('CardChecks', () => {
    it('each tone has an icon and its text', () => {
        const { container } = render(
            <CardChecks
                checks={[
                    { label: 'Rain gauge', tone: 'ok' },
                    { label: 'Radar', tone: 'warn', value: 'slow' },
                    { label: 'Wind sensor', tone: 'bad', value: 'Down' },
                ]}
            />,
        );
        const items = container.querySelectorAll('li');
        expect(items).toHaveLength(3);
        items.forEach((item) => expect(item.querySelector('svg')).not.toBeNull());
        expect(screen.getByText('OK:')).toBeInTheDocument();
        expect(screen.getByText('Warning:')).toBeInTheDocument();
        expect(screen.getByText('Problem:')).toBeInTheDocument();
        expect(screen.getByText('slow')).toBeInTheDocument();
        expect(items[1].querySelector('svg')!.getAttribute('class')).toContain('text-warning');
        expect(items[2].querySelector('svg')!.getAttribute('class')).toContain('text-destructive');
    });

    it('draws markup as literal text', () => {
        const bomb = '<img src=x onerror=alert(1)>';
        const { container } = render(<CardChecks checks={[{ label: bomb, tone: 'bad', value: bomb }]} />);
        expect(screen.getAllByText(bomb)).toHaveLength(2);
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('a')).toBeNull();
    });
});
