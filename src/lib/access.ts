import { SUPER_ADMIN_ROLE_ID, type Viewer } from 'barako-content-form';

/** `GET /api/me` from barakoCMS 4.7: the caller's stored roles and capabilities in the token's tenant. */
export interface Me {
    userId: string;
    username: string;
    tenant: string;
    roles: { id: string; name: string }[];
    /** Sorted, without repeats. A role holding `*` reports `*`, not every name it covers. */
    capabilities: string[];
}

/**
 * What the console knows about what the signed-in caller may do.
 *
 * `known` is true when the API answered `GET /api/me`. Then a capability decides, the same way the
 * API decides it. When it is false (an API older than 4.7 answers 404, or the read failed or has
 * not landed yet) the caller falls back to the role names on the token, which is what every screen
 * did before.
 *
 * Hiding a control is never the access control. The API checks every request; this only decides
 * what is worth offering.
 */
export interface Access {
    known: boolean;
    /**
     * Whether the caller holds `capability`. Without `/api/me`, whether the token holds one of
     * `fallbackRoles`, or SuperAdmin, which every role gate let through.
     */
    can: (capability: string, fallbackRoles?: readonly string[]) => boolean;
    /** Who is looking at an entry, for deciding Sensitive and Hidden fields as the API does. */
    viewer: Viewer;
}

/** Whether a capability list grants `name`: `*` grants everything, names compare without case. */
export function grants(capabilities: readonly string[], name: string): boolean {
    const wanted = name.toLowerCase();
    return capabilities.some((held) => {
        const lower = held.toLowerCase();
        return lower === '*' || lower === wanted;
    });
}

/**
 * Whether a role is let through everything: the seeded SuperAdmin role, recognised by its id as the
 * API recognises it, or a role holding `*`.
 */
export function roleGrantsEverything(role: { id: string; systemCapabilities?: readonly string[] | null }): boolean {
    return role.id.toLowerCase() === SUPER_ADMIN_ROLE_ID || (role.systemCapabilities ?? []).includes('*');
}

export function accessFrom(me: Me | null | undefined, tokenRoles: readonly string[] | undefined): Access {
    const roles = tokenRoles ?? [];

    if (!me) {
        return {
            known: false,
            can: (_capability, fallbackRoles = []) =>
                roles.includes('SuperAdmin') || fallbackRoles.some((role) => roles.includes(role)),
            viewer: { roles },
        };
    }

    const roleIds = me.roles.map((r) => r.id.toLowerCase());
    // The API passes every capability check for the seeded SuperAdmin role by its id, not its name.
    const superAdmin = roleIds.includes(SUPER_ADMIN_ROLE_ID);
    return {
        known: true,
        can: (capability) => superAdmin || grants(me.capabilities, capability),
        viewer: {
            // A field's visibleToRoles holds role names, matched against the stored roles in this
            // tenant, so the names come from the same answer as the ids.
            roles: me.roles.map((r) => r.name),
            roleIds,
            capabilities: me.capabilities,
        },
    };
}
