// Types mirroring the backend RBAC model (Models/Role.cs, ContentTypePermission.cs).
// Permissions are per-content-type CRUD rules; grants are additive across roles.

export type PermissionAction = 'create' | 'read' | 'update' | 'delete';

export interface PermissionRule {
    enabled: boolean;
    // Directus-style conditions, e.g. { "CreatedBy": { "_eq": "$CURRENT_USER" } }. A key written
    // Reference.Field follows the entry's reference and compares a field of the entry it points at.
    conditions?: Record<string, unknown> | null;
    /**
     * On a Read rule, the fields an entry this rule grants shows. Absent or null shows every field.
     * On a save, absent or null keeps the set the role holds and an empty list removes it.
     */
    readableFields?: string[] | null;
    /** On a Create or Update rule, the fields this rule lets the caller set. Same absent rules. */
    writableFields?: string[] | null;
}

export interface ContentTypePermission {
    contentTypeSlug: string;
    create: PermissionRule;
    read: PermissionRule;
    update: PermissionRule;
    delete: PermissionRule;
    /** One rule per named transition of the type's own lifecycle. Not edited here, always sent back. */
    transitions?: Record<string, PermissionRule>;
}

export interface Role {
    id: string;
    name: string;
    description?: string;
    permissions: ContentTypePermission[];
    systemCapabilities: string[];
    createdAt?: string;
    /** Whether the server refuses to delete this role. Derived server side from the seeded ids. */
    isSystem?: boolean;
    /**
     * The tenant that owns this role, or null for a platform role. From contract 8 a role belongs to
     * one tenant or to the whole deployment; an API before that leaves both owner fields out.
     */
    tenantSlug?: string | null;
    /**
     * A role every tenant shares, such as SuperAdmin, Admin and User. Changing or deleting one needs
     * `manage_platform_roles` (403 without it), and it is the only kind `POST /api/users/{id}/roles`
     * takes as a global role.
     */
    isPlatform?: boolean;
}

export interface RoleRequest {
    name: string;
    description?: string;
    permissions: ContentTypePermission[];
    systemCapabilities: string[];
}

export interface User {
    id: string;
    username: string;
    email: string;
    roleIds: string[];
    groupIds: string[];
    createdAt: string;
}

export interface UserGroup {
    id: string;
    name: string;
    description?: string;
    userIds: string[];
    parentGroupId?: string | null;
    childGroupIds?: string[];
}

// Seeded, non-deletable system roles (Data/DataSeeder.cs)
// SYSTEM_ROLE_NAMES used to live here, listing SuperAdmin, Admin, HR and User, and role deletion
// was blocked by matching a name against it. The server blocks by the ids the seeder used, so the
// two could disagree: rename a system role and this offered a delete the server refused, create a
// custom role called "HR" and this locked one the server would happily remove.
//
// The API reports isSystem per role now. Ask, do not re-derive.

export function emptyRule(): PermissionRule {
    return { enabled: false };
}

export function emptyPermission(slug: string): ContentTypePermission {
    return {
        contentTypeSlug: slug,
        create: emptyRule(),
        read: emptyRule(),
        update: emptyRule(),
        delete: emptyRule(),
    };
}

/**
 * Whether a role can be given as a global role, through `POST /api/users/{id}/roles`.
 *
 * A global role grants in every tenant, so from contract 8 the API takes only a platform role there
 * and answers 400 naming a tenant's role. An API before 8 reports no owner, and every role it lists
 * is a deployment role, so every one stays on offer.
 */
export function isGlobalRoleCandidate(role: Pick<Role, 'isPlatform' | 'tenantSlug'>): boolean {
    return role.isPlatform === true || !role.tenantSlug;
}

/** Who owns a role, for the Roles list: the platform, a tenant, or nothing an older API reports. */
export function roleOwner(role: Pick<Role, 'isPlatform' | 'tenantSlug'>): string | null {
    if (role.isPlatform === true) return 'Platform';
    return role.tenantSlug ? role.tenantSlug : null;
}

export const PLATFORM_ROLE_LOCKED =
    'This is a platform role, shared by every tenant. Changing or deleting it needs the manage_platform_roles capability.';

/**
 * Whether this caller may change or delete the role. The API answers 403 to a platform role edited
 * without `manage_platform_roles`, so the console does not offer it. A role an older API reports no
 * owner for is decided by the API, as before.
 */
export function mayChangeRole(role: Pick<Role, 'isPlatform'>, canManagePlatformRoles: boolean): boolean {
    return role.isPlatform !== true || canManagePlatformRoles;
}
