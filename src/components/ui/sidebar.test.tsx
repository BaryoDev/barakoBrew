import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

    function renderMenu(link: React.ReactNode, extra?: React.ReactNode) {
        render(
            <SidebarProvider>
                <Sidebar>
                    <SidebarContent>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild closesDrawer>
                                    {link}
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            {extra}
                        </SidebarMenu>
                    </SidebarContent>
                </Sidebar>
                <SidebarTrigger />
            </SidebarProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    }

    it('closes when a nav link is clicked, after the caller onClick runs', () => {
        setViewportWidth(900);
        const onClick = vi.fn();
        renderMenu(
            <a href="#two" onClick={onClick}>
                Two
            </a>,
        );

        fireEvent.click(screen.getByRole('link', { name: 'Two' }));

        expect(onClick).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('stays open when the caller onClick prevents default', () => {
        setViewportWidth(900);
        renderMenu(
            <a href="#two" onClick={(e) => e.preventDefault()}>
                Two
            </a>,
        );

        fireEvent.click(screen.getByRole('link', { name: 'Two' }));

        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it.each([
        ['cmd', { metaKey: true }],
        ['ctrl', { ctrlKey: true }],
        ['shift', { shiftKey: true }],
        ['alt', { altKey: true }],
        ['middle button', { button: 1 }],
    ])('stays open on a %s click', (_name, init) => {
        setViewportWidth(900);
        renderMenu(<a href="#two">Two</a>);

        fireEvent.click(screen.getByRole('link', { name: 'Two' }), init);

        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('stays open for a link that opens a new tab', () => {
        setViewportWidth(900);
        renderMenu(
            <a href="#two" target="_blank" rel="noreferrer">
                Two
            </a>,
        );

        fireEvent.click(screen.getByRole('link', { name: 'Two' }));

        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('keeps the sheet open when the account trigger opens its menu', async () => {
        const user = userEvent.setup();
        setViewportWidth(900);
        render(
            <SidebarProvider>
                <Sidebar>
                    <SidebarContent>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <SidebarMenuButton>Account</SidebarMenuButton>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem>Sign out</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarContent>
                </Sidebar>
                <SidebarTrigger />
            </SidebarProvider>,
        );
        await user.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Account' }));

        // The modal menu hides everything else from the accessibility tree, the sheet included, so
        // ask for it with hidden: true. A closed sheet is unmounted, so this fails if the click closed it.
        expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
        const hiddenSheet = screen.getByRole('dialog', { hidden: true });
        expect(hiddenSheet.getAttribute('data-state')).toBe('open');

        await user.keyboard('{Escape}');

        expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull();
        expect(screen.getByRole('dialog').getAttribute('data-state')).toBe('open');
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
