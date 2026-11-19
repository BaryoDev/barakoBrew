import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

let enabled: string[] | undefined;
vi.mock('@/hooks/use-modules', () => ({
    useEnabledModules: () => enabled,
    useModules: () => ({
        isLoading: false,
        data: { kind: 'modules', modules: [{ name: 'Fake', enabled: true, contractVersion: 1, schemaState: 'ready', schemaChanges: [] }] },
    }),
}));
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => 'cafe' }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/components/modules/module-screen', () => ({
    ModuleScreen: ({ children }: { children?: ReactNode }) => (
        <div data-testid="template">{children ?? <div data-testid="table-body" />}</div>
    ),
}));
vi.mock('@/components/modules/module-adapters', () => ({
    ModuleAdapterBody: () => <div data-testid="usual-body" />,
}));

const { default: ModulePage } = await import('./page');
const { registerSlot, resetSlots } = await import('@/lib/extension-slots');

const params = (name: string) => Object.assign(Promise.resolve({ name }), { status: 'fulfilled', value: { name } });

beforeEach(() => {
    resetSlots();
    enabled = ['Fake'];
});

describe('the module page', () => {
    it('keeps the template table body when no screen is registered', () => {
        render(<ModulePage params={params('Fake')} />);
        expect(screen.getByTestId('table-body')).toBeInTheDocument();
    });

    it('replaces the body with a registered screen', () => {
        registerSlot('module-screen', 'Fake', () => <div data-testid="screen" />);
        render(<ModulePage params={params('Fake')} />);
        expect(screen.getByTestId('screen')).toBeInTheDocument();
        expect(screen.queryByTestId('table-body')).toBeNull();
    });

    it('falls back to the usual body when the screen throws', () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        registerSlot('module-screen', 'Fake', () => {
            throw new Error('boom');
        });
        render(<ModulePage params={params('Fake')} />);
        expect(screen.getByTestId('usual-body')).toBeInTheDocument();
        log.mockRestore();
    });
});
