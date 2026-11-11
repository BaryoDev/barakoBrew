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

describe('the theme row', () => {
    it('stores the choice under bk-brew-theme and sets the dark class', () => {
        renderToggle();
        fireEvent.click(screen.getByRole('button', { name: 'Dark mode' }));

        expect(localStorage.getItem('bk-brew-theme')).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('names the mode you would switch to, and flips the label when you do', () => {
        renderToggle();
        expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Light mode' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Dark mode' }));
        expect(screen.getByRole('button', { name: 'Light mode' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Dark mode' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Light mode' }));
        expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument();
    });

    it('turns dark off again', () => {
        localStorage.setItem('bk-brew-theme', 'dark');
        renderToggle();
        const row = screen.getByRole('button', { name: 'Light mode' });

        fireEvent.click(row);

        expect(localStorage.getItem('bk-brew-theme')).toBe('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('follows the OS setting until a choice is stored', () => {
        mockMedia(true);
        renderToggle();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(screen.getByRole('button', { name: 'Light mode' })).toBeInTheDocument();
        expect(localStorage.getItem('bk-brew-theme')).toBeNull();
    });
});
