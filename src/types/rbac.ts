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
