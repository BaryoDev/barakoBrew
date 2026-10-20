import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();
let memberships: { slug: string; name: string; roles?: { id: string; name: string }[] }[] | undefined;
let current: string | null;
let roles: string[];

vi.mock('@/hooks/use-tenants', () => ({
    useMyTenants: () => ({ data: memberships }),
    useCurrentTenant: () => current,
    useSwitchTenant: () => ({ mutate, isPending: false }),
}));
vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: { userId: 'u1', username: 'r', roles } }),
}));

const { TenantSwitcher } = await import('./tenant-switcher');

const club = { slug: 'club', name: 'The Club', roles: [{ id: 'r1', name: 'Registrar' }] };
const other = { slug: 'other', name: 'Other Place' };

async function openPopover() {
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Switch tenant' }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole('button', { name: 'Switch tenant' }));
}

describe('TenantSwitcher', () => {
    beforeEach(() => {
        mutate.mockReset();
        memberships = [club, other];
        current = 'club';
        roles = ['Registrar'];
    });

    it('shows the role from the API roles beside the slug', async () => {
        render(<TenantSwitcher />);
        await openPopover();
        expect(screen.getByText('club · Registrar')).toBeTruthy();
        expect(screen.getByText('other')).toBeTruthy();
    });

    it('renders nothing when the user has no memberships', () => {
        memberships = [];
        const { container } = render(<TenantSwitcher />);
        expect(container.innerHTML).toBe('');
        expect(mutate).not.toHaveBeenCalled();
    });

    it('keeps a switch to Home from being undone by the auto-switch', async () => {
        const { rerender } = render(<TenantSwitcher />);
        expect(mutate).not.toHaveBeenCalled();
        await openPopover();
        fireEvent.click(await screen.findByRole('button', { name: /Home/ }));
        expect(mutate).toHaveBeenCalledTimes(1);
        expect(mutate).toHaveBeenCalledWith('default');
        current = 'default';
        mutate.mockClear();
        rerender(<TenantSwitcher />);
        expect(mutate).not.toHaveBeenCalled();
    });

    it('hides Create a tenant from anyone but SuperAdmin', async () => {
        render(<TenantSwitcher />);
        await openPopover();
        expect(screen.getByText('Home')).toBeTruthy();
        expect(screen.queryByText('Create a tenant')).toBeNull();
    });

    it('shows Create a tenant to SuperAdmin', async () => {
        roles = ['SuperAdmin'];
        render(<TenantSwitcher />);
        await openPopover();
        expect(screen.getByText('Create a tenant')).toBeTruthy();
    });

    it('filters the list with the find field', async () => {
        render(<TenantSwitcher />);
        await openPopover();
        // The current tenant's name is on the trigger as well as in its row in the list.
        expect(screen.getAllByText('The Club')).toHaveLength(2);
        expect(screen.getByText('Other Place')).toBeTruthy();
        fireEvent.change(screen.getByRole('textbox', { name: 'Find a tenant' }), { target: { value: 'oth' } });
        expect(screen.getAllByText('The Club')).toHaveLength(1);
        expect(screen.getByText('Other Place')).toBeTruthy();
    });
});
