import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

let enabled: string[] | undefined;
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { roles: ['SuperAdmin'] } }) }));
vi.mock('@/hooks/use-access', () => ({ useAccess: () => ({ known: false, can: () => true }) }));
vi.mock('@/hooks/use-sessions', () => ({ useSessionsGone: () => false }));
vi.mock('@/hooks/use-activity', () => ({ useActivityGone: () => false }));
vi.mock('@/hooks/use-modules', () => ({
    useEnabledModules: () => enabled,
    useModules: () => ({
        data: { kind: 'modules', modules: [{ name: 'Fake', packageId: null, enabled: true }] },
    }),
}));

const { useAllowedGroups, hrefsOf } = await import('./use-visible-hrefs');
const { registerSlot, resetSlots } = await import('@/lib/extension-slots');

beforeEach(() => {
    resetSlots();
    enabled = ['Files', 'Fake'];
});

describe('useAllowedGroups with a module screen', () => {
    it('offers the screen of a running module in the rail', () => {
        registerSlot('module-screen', 'Fake', () => null);
        const { result } = renderHook(() => useAllowedGroups());
        const items = result.current.flatMap((g) => g.items);
        expect(items.map((i) => i.href)).toContain('/modules/Fake');
        expect(items.find((i) => i.href === '/modules/Fake')?.title).toBe('Fake');
        expect(hrefsOf(result.current).has('/modules/Fake')).toBe(true);
    });

    it('offers nothing when no screen is registered', () => {
        const { result } = renderHook(() => useAllowedGroups());
        expect(hrefsOf(result.current).has('/modules/Fake')).toBe(false);
    });
});
