import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let enabled: string[] | undefined;
vi.mock('@/hooks/use-modules', () => ({ useEnabledModules: () => enabled }));
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => 'cafe' }));

const { OverviewCardSlot } = await import('./overview-card-slot');
const { registerSlot, resetSlots } = await import('@/lib/extension-slots');

beforeEach(() => {
    resetSlots();
    enabled = ['Files'];
});

describe('the Overview card slot', () => {
    it('renders nothing when no extension registered', () => {
        const { container } = render(<OverviewCardSlot />);
        expect(container).toBeEmptyDOMElement();
    });

    it('mounts a registered card when its module runs, with tenant and modules only', () => {
        registerSlot('overview-card', 'Fake', ({ tenant, modules }) => (
            <div data-testid="fake">{tenant}:{modules.join(',')}</div>
        ));
        enabled = ['Files', 'Fake'];
        render(<OverviewCardSlot />);
        expect(screen.getByTestId('fake')).toHaveTextContent('cafe:Files,Fake');
    });

    it('never mounts a card whose module is not reported', () => {
        registerSlot('overview-card', 'Fake', () => <div data-testid="fake" />);
        render(<OverviewCardSlot />);
        expect(screen.queryByTestId('fake')).toBeNull();
    });

    it('mounts nothing while the module report has no answer', () => {
        registerSlot('overview-card', 'Fake', () => <div data-testid="fake" />);
        enabled = undefined;
        render(<OverviewCardSlot />);
        expect(screen.queryByTestId('fake')).toBeNull();
    });

    it('hides a card that throws and keeps the others', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        registerSlot('overview-card', 'Bad', () => {
            throw new Error('boom');
        });
        registerSlot('overview-card', 'Good', () => <div data-testid="good" />);
        enabled = ['Bad', 'Good'];
        render(<OverviewCardSlot />);
        expect(screen.getByTestId('good')).toBeInTheDocument();
        spy.mockRestore();
    });

    it('keeps one card per module when it registers twice', () => {
        registerSlot('overview-card', 'Fake', () => <div data-testid="fake" />);
        registerSlot('overview-card', 'Fake', () => <div data-testid="fake" />);
        enabled = ['Fake'];
        render(<OverviewCardSlot />);
        expect(screen.getAllByTestId('fake')).toHaveLength(1);
    });
});
