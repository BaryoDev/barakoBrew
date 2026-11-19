import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

let enabled: string[] | undefined;
vi.mock('@/hooks/use-settings', () => ({
    useSettings: () => ({ data: [], isLoading: false }),
    useUpdateSetting: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-access', () => ({ useAccess: () => ({ can: () => false }) }));
vi.mock('@/hooks/use-modules', () => ({
    useEnabledModules: () => enabled,
    useModuleEnabled: () => false,
}));
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => 'cafe' }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/link', () => ({
    default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const { default: SettingsPage } = await import('./page');
const { registerSlot, resetSlots } = await import('@/lib/extension-slots');

beforeEach(() => {
    resetSlots();
    enabled = ['Fake'];
});

describe('the Settings page', () => {
    it('mounts a registered settings section for a running module', () => {
        registerSlot('settings-section', 'Fake', () => <div data-testid="section" />);
        render(<SettingsPage />);
        expect(screen.getByTestId('section')).toBeInTheDocument();
    });

    it('shows no section when none is registered', () => {
        render(<SettingsPage />);
        expect(screen.queryByTestId('section')).toBeNull();
    });
});
