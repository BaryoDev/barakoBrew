import { describe, expect, it } from 'vitest';
import { isGlobalRoleCandidate, mayChangeRole, roleOwner } from './rbac';

const PLATFORM = { isPlatform: true, tenantSlug: null };
const TENANT_ROLE = { isPlatform: false, tenantSlug: 'acme' };
const OLDER = {};

describe('a role read from contract 8, which reports its owner', () => {
    it('is named by its owner', () => {
        expect(roleOwner(PLATFORM)).toBe('Platform');
        expect(roleOwner(TENANT_ROLE)).toBe('acme');
    });

    it('can be a global role only when it is a platform role', () => {
        expect(isGlobalRoleCandidate(PLATFORM)).toBe(true);
        expect(isGlobalRoleCandidate(TENANT_ROLE)).toBe(false);
    });

    it('is changed only by a holder of manage_platform_roles when it is a platform role', () => {
        expect(mayChangeRole(PLATFORM, false)).toBe(false);
        expect(mayChangeRole(PLATFORM, true)).toBe(true);
        expect(mayChangeRole(TENANT_ROLE, false)).toBe(true);
    });
});

describe('a role read from an API before contract 8, which reports no owner', () => {
    it('names no owner, stays on offer as a global role and leaves the API to decide a change', () => {
        expect(roleOwner(OLDER)).toBeNull();
        expect(isGlobalRoleCandidate(OLDER)).toBe(true);
        expect(mayChangeRole(OLDER, false)).toBe(true);
    });
});
