import { describe, it, expect } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    Sidebar,
    SidebarContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
} from '@/components/ui/sidebar';
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

    it('keeps Tab inside the sheet, wrapping at both ends', async () => {
        const user = userEvent.setup();
        setViewportWidth(900);
        renderShell();
        await user.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));

        const dialog = screen.getByRole('dialog');
        const tabbable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button'));
        // Three links and the sheet's own Close button, which is the real last stop.
        expect(tabbable).toHaveLength(4);
        const first = tabbable[0];
        const last = tabbable[tabbable.length - 1];

        last.focus();
        expect(document.activeElement).toBe(last);
        await user.tab();
        expect(document.activeElement).toBe(first);

        await user.tab({ shift: true });
        expect(document.activeElement).toBe(last);
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

describe('the drawer state', () => {
    it('does not reopen by itself after widening to the rail and narrowing again', () => {
        setViewportWidth(900);
        renderShell();
        fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        act(() => setViewportWidth(1100));
        expect(screen.queryByRole('dialog')).toBeNull();

        act(() => setViewportWidth(900));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes when a nav link is clicked', () => {
        setViewportWidth(900);
        render(
            <SidebarProvider>
                <Sidebar>
                    <SidebarContent>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild>
                                    <a href="#two">Two</a>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarContent>
                </Sidebar>
                <SidebarTrigger />
            </SidebarProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('link', { name: 'Two' }));

        expect(screen.queryByRole('dialog')).toBeNull();
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
