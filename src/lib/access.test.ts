import { describe, expect, it } from 'vitest';
import { SUPER_ADMIN_ROLE_ID } from 'barako-content-form';
import { accessFrom, grants, roleGrantsEverything, type Me } from './access';

const me = (capabilities: string[], roles = [{ id: 'r-1', name: 'Registrar' }]): Me => ({
    userId: 'u',
    username: 'u',
    tenant: 'default',
    roles,
    capabilities,
});

describe('accessFrom with /api/me', () => {
    it('decides by capability, ignoring case, and ignores the fallback roles', () => {
        const access = accessFrom(me(['Rollback_Content']), ['Admin']);
        expect(access.known).toBe(true);
        expect(access.can('rollback_content', ['Admin'])).toBe(true);
        expect(access.can('erase_content', ['Admin'])).toBe(false);
    });

    it('lets the seeded SuperAdmin role through by id, whatever it is called', () => {
        const access = accessFrom(me([], [{ id: SUPER_ADMIN_ROLE_ID.toUpperCase(), name: 'Owner' }]), []);
        expect(access.can('manage_tenants')).toBe(true);
    });

    it('does not let a role merely named SuperAdmin through', () => {
        const access = accessFrom(me([], [{ id: 'r-5', name: 'SuperAdmin' }]), ['SuperAdmin']);
        expect(access.can('manage_tenants', ['SuperAdmin'])).toBe(false);
    });

    it('hands the form the stored role names, ids and capabilities', () => {
        const access = accessFrom(me(['view_sensitive']), ['TokenRole']);
        expect(access.viewer).toEqual({ roles: ['Registrar'], roleIds: ['r-1'], capabilities: ['view_sensitive'] });
    });
});

describe('accessFrom without /api/me', () => {
    it('falls back to the role names on the token, with SuperAdmin let through', () => {
        const access = accessFrom(null, ['Admin']);
        expect(access.known).toBe(false);
        expect(access.can('rollback_content', ['SuperAdmin', 'Admin'])).toBe(true);
        expect(access.can('manage_tenants', ['SuperAdmin'])).toBe(false);
        expect(accessFrom(undefined, ['SuperAdmin']).can('manage_tenants')).toBe(true);
        expect(accessFrom(null, undefined).can('manage_tenants', ['SuperAdmin'])).toBe(false);
    });

    it('leaves capabilities off the viewer, so the form keeps the older rule by name', () => {
        expect(accessFrom(null, ['HR']).viewer).toEqual({ roles: ['HR'] });
    });
});

describe('grants and roleGrantsEverything', () => {
    it('reads * as every capability', () => {
        expect(grants(['*'], 'anything')).toBe(true);
        expect(grants(['upload_files'], 'manage_all_files')).toBe(false);
    });

    it('recognises the SuperAdmin role by id or a role holding *, not by name', () => {
        expect(roleGrantsEverything({ id: SUPER_ADMIN_ROLE_ID, systemCapabilities: [] })).toBe(true);
        expect(roleGrantsEverything({ id: 'r-1', systemCapabilities: ['*'] })).toBe(true);
        expect(roleGrantsEverything({ id: 'r-1', systemCapabilities: ['manage_roles'] })).toBe(false);
    });
});
