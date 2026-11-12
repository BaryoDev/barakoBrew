import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const net = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), request: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: net, isForbidden: () => false }));

const { TryItCard, hasDemo } = await import('./try-it-card');

const fetchSpy = vi.fn();

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchSpy);
    Object.values(net).forEach((f) => f.mockClear());
    fetchSpy.mockClear();
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('TryItCard', () => {
    it('only has a script for modules the canvas covers', () => {
        expect(hasDemo('FeatureFlags')).toBe(true);
        expect(hasDemo('Unknown')).toBe(false);
    });

    it('shows the demo label before anything runs', () => {
        render(<TryItCard name="FeatureFlags" />);
        expect(screen.getByTestId('try-it-demo-label').textContent).toMatch(/Demo/);
        expect(screen.getByText('Try it')).toBeTruthy();
    });

    it('plays the canned lines and a result without any network call', () => {
        render(<TryItCard name="FeatureFlags" />);
        fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
        act(() => {
            vi.advanceTimersByTime(420 * 4);
        });
        expect(screen.getByText('bucket 14 of 100')).toBeTruthy();
        expect(screen.getByTestId('try-it-result').textContent).toContain('new-editor is on for Ana');
        expect(screen.getByRole('button', { name: 'Run again' })).toBeTruthy();
        expect(fetchSpy).not.toHaveBeenCalled();
        Object.values(net).forEach((f) => expect(f).not.toHaveBeenCalled());
    });

    it('switches case and plays the failing script', () => {
        render(<TryItCard name="FeatureFlags" />);
        fireEvent.click(screen.getByRole('button', { name: 'Ben · kape-ana' }));
        fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
        act(() => {
            vi.advanceTimersByTime(420 * 4);
        });
        expect(screen.getByTestId('try-it-result').textContent).toContain('new-editor stays off');
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
