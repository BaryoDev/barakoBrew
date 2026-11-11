import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let resolvedTheme = 'light';
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme, setTheme: vi.fn() }) }));

const { ThemeSwitch } = await import('./theme-switch');

describe('ThemeSwitch', () => {
    it('offers Dark mode in the light theme', () => {
        resolvedTheme = 'light';
        render(<ThemeSwitch />);
        expect(screen.getByRole('button')).toHaveTextContent('Dark mode');
    });

    it('offers Light mode in the dark theme', () => {
        resolvedTheme = 'dark';
        render(<ThemeSwitch />);
        expect(screen.getByRole('button')).toHaveTextContent('Light mode');
    });
});
