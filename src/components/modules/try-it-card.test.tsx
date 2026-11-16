import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
        expect(screen.getByTestId('try-it-demo-label').textContent).toMatch(/Demo/);
        expect(fetchSpy).not.toHaveBeenCalled();
        Object.values(net).forEach((f) => expect(f).not.toHaveBeenCalled());
    });

    it('switches case and plays the failing script', () => {
        render(<TryItCard name="FeatureFlags" />);
        fireEvent.click(screen.getByRole('button', { name: 'Ben · demo-site' }));
        fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
        act(() => {
            vi.advanceTimersByTime(420 * 4);
        });
        expect(screen.getByTestId('try-it-result').textContent).toContain('new-editor stays off');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('uses a log region for the console and hides the glyphs from assistive tech', () => {
        render(<TryItCard name="FeatureFlags" />);
        fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
        act(() => {
            vi.advanceTimersByTime(420 * 4);
        });
        const log = screen.getByRole('log');
        expect(log.getAttribute('aria-live')).toBe('polite');
        expect(log.querySelectorAll('[aria-hidden="true"]').length).toBe(4);
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('drops the old lines when the case changes mid-run and plays nothing more', () => {
        render(<TryItCard name="FeatureFlags" />);
        fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
        act(() => {
            vi.advanceTimersByTime(420);
        });
        expect(screen.getByTestId('try-it-console').textContent).toContain('flag  new-editor');
        fireEvent.click(screen.getByRole('button', { name: 'Ben · demo-site' }));
        act(() => {
            vi.advanceTimersByTime(420 * 6);
        });
        expect(screen.getByTestId('try-it-console').textContent).toBe('Pick a case and press Evaluate.');
        expect(screen.queryByTestId('try-it-result')).toBeNull();
        expect(screen.getByRole('button', { name: 'Evaluate' }).hasAttribute('disabled')).toBe(false);
    });

    it('stops its timer on unmount mid-run', () => {
        const { unmount } = render(<TryItCard name="FeatureFlags" />);
        fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
        act(() => {
            vi.advanceTimersByTime(420);
        });
        unmount();
        expect(() => vi.advanceTimersByTime(420 * 6)).not.toThrow();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('shows every line and the result at once under reduced motion', () => {
        vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
        render(<TryItCard name="FeatureFlags" />);
        fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
        expect(screen.getByText('bucket 14 of 100')).toBeTruthy();
        expect(screen.getByTestId('try-it-result').textContent).toContain('new-editor is on for Ana');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not import an API client or call fetch in its source', () => {
        const src = readFileSync(join(__dirname, 'try-it-card.tsx'), 'utf8');
        expect(src).not.toMatch(/from ['"]@\/lib\/api['"]/);
        expect(src).not.toMatch(/from ['"]axios['"]/);
        expect(src).not.toMatch(/\bfetch\s*\(/);
        expect(src).not.toMatch(/@\/hooks\//);
    });
});
