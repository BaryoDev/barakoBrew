import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, THEME_STORAGE_KEY } from '@/components/theme-provider';

const { ThemeToggle } = await import('./theme-toggle');
const { SidebarProvider } = await import('@/components/ui/sidebar');

function mockMedia(dark: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: dark && query.includes('dark'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
}

function renderToggle() {
    return render(
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey={THEME_STORAGE_KEY}>
            <SidebarProvider>
                <ThemeToggle />
            </SidebarProvider>
        </ThemeProvider>,
    );
}

beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    mockMedia(false);
});

describe('the Dark mode row', () => {
    it('stores the choice under bk-brew-theme and sets the dark class', () => {
        renderToggle();
        const row = screen.getByRole('switch', { name: /Dark mode/ });
        expect(row).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(row);

        expect(localStorage.getItem('bk-brew-theme')).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(screen.getByRole('switch', { name: /Dark mode/ })).toHaveAttribute('aria-checked', 'true');
    });

    it('turns dark off again', () => {
        localStorage.setItem('bk-brew-theme', 'dark');
        renderToggle();
        const row = screen.getByRole('switch', { name: /Dark mode/ });
        expect(row).toHaveAttribute('aria-checked', 'true');

        fireEvent.click(row);

        expect(localStorage.getItem('bk-brew-theme')).toBe('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('follows the OS setting until a choice is stored', () => {
        mockMedia(true);
        renderToggle();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(screen.getByRole('switch', { name: /Dark mode/ })).toHaveAttribute('aria-checked', 'true');
        expect(localStorage.getItem('bk-brew-theme')).toBeNull();
    });
});
