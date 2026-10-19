import { describe, it, expect } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Sidebar, SidebarContent, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { setViewportWidth } from '@/test/setup';

function renderShell() {
    render(
        <SidebarProvider>
            <Sidebar>
                <SidebarContent>
                    <a href="/one">One</a>
                    <a href="/two">Two</a>
                    <a href="/three">Three</a>
                </SidebarContent>
            </Sidebar>
            <SidebarTrigger />
        </SidebarProvider>,
    );
}

const rail = () => document.querySelector('[data-slot="sidebar"]:not([role="dialog"])');

describe('the sidebar below 1000px', () => {
    it('is the Radix sheet at 900px, closed until the trigger is pressed', () => {
        setViewportWidth(900);
        renderShell();

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByRole('link', { name: 'One' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));

        const dialog = screen.getByRole('dialog');
        expect(dialog.getAttribute('data-mobile')).toBe('true');
        expect(screen.getAllByRole('link')).toHaveLength(3);
    });

    it('keeps Tab inside the sheet, wrapping at both ends', () => {
        setViewportWidth(900);
        renderShell();
        fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));

        const dialog = screen.getByRole('dialog');
        const links = screen.getAllByRole('link');
        expect(links).toHaveLength(3);
        const inside = (el: Element | null) => el !== null && dialog.contains(el);

        links[2].focus();
        fireEvent.keyDown(links[2], { key: 'Tab' });
        expect(inside(document.activeElement)).toBe(true);
        expect(document.activeElement).not.toBe(document.body);

        const first = document.activeElement as HTMLElement;
        fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
        expect(inside(document.activeElement)).toBe(true);
        expect(document.activeElement).not.toBe(first);
    });

    it('closes on Escape', () => {
        setViewportWidth(900);
        renderShell();
        fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('turns into the drawer when the window narrows past 1000px', () => {
        setViewportWidth(1100);
        renderShell();
        expect(rail()).not.toBeNull();

        act(() => setViewportWidth(999));
        fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));

        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});

describe('the sidebar at 1000px and above', () => {
    it('shows the rail at 1100px and never opens a sheet', () => {
        setViewportWidth(1100);
        renderShell();

        expect(rail()).not.toBeNull();
        expect(screen.getAllByRole('link')).toHaveLength(3);

        fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));

        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('shows the rail at exactly 1000px', () => {
        setViewportWidth(1000);
        renderShell();

        expect(rail()).not.toBeNull();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
