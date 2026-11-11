import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { REMEMBERED_KEY } from '@/lib/remembered-instance';

type Q = { isSuccess: boolean; isFetching: boolean; data: unknown };
const done = (data: unknown): Q => ({ isSuccess: true, isFetching: false, data });
let slug: string | null;
let tenants: Q;
let meta: Q;
let modules: Q;

vi.mock('@/lib/api', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/api')>()),
    getApiUrl: () => 'https://api.cafe.example:8443',
}));
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => slug, useMyTenants: () => tenants }));
vi.mock('@/hooks/use-meta', () => ({ useApiMeta: () => meta }));
vi.mock('@/hooks/use-modules', () => ({ useModules: () => modules }));

const { RememberInstance } = await import('./remember-instance');

describe('RememberInstance', () => {
    beforeEach(() => {
        localStorage.clear();
        slug = 'cafe';
        tenants = done([{ slug: 'cafe', name: 'Kapé Ana', branding: {} }]);
        meta = done({ version: '5.1.0', swaggerEnabled: false });
        modules = done({
            kind: 'modules',
            modules: [
                { name: 'a', enabled: true },
                { name: 'b', enabled: true },
                { name: 'c', enabled: false },
            ],
        });
    });

    it('stores the display name, version, enabled module count and time for the API origin', () => {
        render(<RememberInstance />);
        const stored = JSON.parse(localStorage.getItem(REMEMBERED_KEY)!);
        expect(stored).toMatchObject({
            origin: 'https://api.cafe.example:8443',
            name: 'Kapé Ana',
            version: '5.1.0',
            modules: 2,
        });
        expect(typeof stored.seenAt).toBe('string');
        expect(localStorage.getItem(REMEMBERED_KEY)).not.toMatch(/token|email|password/i);
    });

    it('writes nothing while any of the three is still loading', () => {
        modules = { isSuccess: false, isFetching: true, data: undefined };
        render(<RememberInstance />);
        expect(localStorage.getItem(REMEMBERED_KEY)).toBeNull();
    });

    it('writes nothing while a refetch is under way, such as after a tenant switch', () => {
        tenants = { ...done([{ slug: 'cafe', name: 'Kapé Ana', branding: {} }]), isFetching: true };
        render(<RememberInstance />);
        expect(localStorage.getItem(REMEMBERED_KEY)).toBeNull();
    });

    it('does not use the tenant slug as the name', () => {
        tenants = done([]);
        render(<RememberInstance />);
        expect(localStorage.getItem(REMEMBERED_KEY)).toBeNull();
    });

    it('writes nothing when the module list is unreadable', () => {
        modules = done({ kind: 'unreadable' });
        render(<RememberInstance />);
        expect(localStorage.getItem(REMEMBERED_KEY)).toBeNull();
    });
});
