import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

let enabled: string[] | undefined;
vi.mock('@/hooks/use-modules', () => ({ useEnabledModules: () => enabled }));
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => 'cafe' }));

const client = new QueryClient();
const render = (ui: ReactElement) => rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

const { OverviewCardSlot } = await import('./overview/overview-card-slot');
const { SettingsSectionSlot } = await import('./settings-section-slot');
const { ModuleScreenSlot } = await import('./modules/module-screen-slot');
const { registerSlot, resetSlots } = await import('@/lib/extension-slots');
const { withModuleScreens, NAV_GROUPS, visibleGroups, withModules } = await import('@/lib/navigation');
const { useSlot } = await import('@/hooks/use-slots');

beforeEach(() => {
    resetSlots();
    enabled = ['Files'];
});

function Both() {
    return (
        <>
            <OverviewCardSlot />
            <SettingsSectionSlot />
        </>
    );
}

describe('a fake module in the slots', () => {
    it('mounts its card and section when present and unmounts them when it goes', () => {
        registerSlot('overview-card', 'Fake', () => <div data-testid="card" />);
        registerSlot('settings-section', 'Fake', () => <div data-testid="section" />);

        const view = render(<Both />);
        expect(screen.queryByTestId('card')).toBeNull();
        expect(screen.queryByTestId('section')).toBeNull();

        enabled = ['Files', 'Fake'];
        view.rerender(
            <QueryClientProvider client={client}>
                <Both />
            </QueryClientProvider>,
        );
        expect(screen.getByTestId('card')).toBeInTheDocument();
        expect(screen.getByTestId('section')).toBeInTheDocument();

        enabled = ['Files'];
        view.rerender(
            <QueryClientProvider client={client}>
                <Both />
            </QueryClientProvider>,
        );
        expect(screen.queryByTestId('card')).toBeNull();
        expect(screen.queryByTestId('section')).toBeNull();
    });

    it('gives a settings section tenant, modules and the shared query client only', () => {
        let seen: Record<string, unknown> = {};
        registerSlot('settings-section', 'Fake', (props) => {
            seen = props as unknown as Record<string, unknown>;
            return null;
        });
        enabled = ['Fake'];
        render(<SettingsSectionSlot />);
        expect(Object.keys(seen).sort()).toEqual(['modules', 'queryClient', 'tenant']);
        expect(seen.queryClient).toBe(client);
        expect(seen.tenant).toBe('cafe');
    });

    it('mounts a module screen only for its own module, and only while it runs', () => {
        registerSlot('module-screen', 'Fake', () => <div data-testid="screen" />);
        registerSlot('module-screen', 'Other', () => <div data-testid="other" />);
        enabled = ['Fake', 'Other'];
        const view = render(<ModuleScreenSlot name="Fake" />);
        expect(screen.getByTestId('screen')).toBeInTheDocument();
        expect(screen.queryByTestId('other')).toBeNull();

        enabled = ['Other'];
        view.rerender(
            <QueryClientProvider client={client}>
                <ModuleScreenSlot name="Fake" />
            </QueryClientProvider>,
        );
        expect(screen.queryByTestId('screen')).toBeNull();
    });

    it('keeps a slot kind and a props shape typed', () => {
        // @ts-expect-error a module screen is not given a page internal
        registerSlot('module-screen', 'Fake', (props: { router: unknown }) => <div>{String(props.router)}</div>);
        // @ts-expect-error 'toolbar' is not a slot kind
        expect(() => registerSlot('toolbar', 'Fake', () => null)).toThrow();
    });
});

describe('the public build with an empty registry', () => {
    it('renders no extra card, section or screen', () => {
        enabled = ['Files', 'Forms', 'Fake'];
        const { container } = render(<Both />);
        expect(container.querySelector('[data-testid="settings-section-slot"]')).toBeEmptyDOMElement();
        expect(container.querySelector('[data-testid="settings-section-slot"]')?.children).toHaveLength(0);
        const screenView = render(<ModuleScreenSlot name="Fake" />);
        expect(screenView.container).toBeEmptyDOMElement();
    });

    it('adds no nav entry', () => {
        const base = withModules(visibleGroups(NAV_GROUPS, ['SuperAdmin']), ['Files', 'Fake']);
        expect(withModuleScreens(base, ['Files', 'Fake'], [])).toEqual(base);
        expect(typeof useSlot).toBe('function');
    });
});

describe('the nav rule for module screens', () => {
    const base = () => withModules(visibleGroups(NAV_GROUPS, ['SuperAdmin']), ['Files', 'Fake']);
    const hrefs = (groups: ReturnType<typeof base>) => groups.flatMap((g) => g.items.map((i) => i.href));

    it('shows a screen when the module is present and a screen is registered', () => {
        const out = hrefs(withModuleScreens(base(), ['Files', 'Fake'], ['Fake']));
        expect(out).toContain('/modules/Fake');
        expect(out.indexOf('/modules/Fake')).toBeLessThan(out.indexOf('/modules'));
    });

    it('shows nothing when the module is present and no screen is registered', () => {
        expect(hrefs(withModuleScreens(base(), ['Files', 'Fake'], []))).not.toContain('/modules/Fake');
    });

    it('shows nothing when a screen is registered and the module is absent', () => {
        expect(hrefs(withModuleScreens(base(), ['Files'], ['Fake']))).not.toContain('/modules/Fake');
    });

    it('shows nothing while the module report has no answer', () => {
        expect(hrefs(withModuleScreens(base(), undefined, ['Fake']))).not.toContain('/modules/Fake');
    });

    it('offers nothing to a caller who cannot see All modules', () => {
        const groups = withModules(visibleGroups(NAV_GROUPS, ['User']), ['Fake']);
        expect(hrefs(withModuleScreens(groups, ['Fake'], ['Fake']))).not.toContain('/modules/Fake');
    });
});
