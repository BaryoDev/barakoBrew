import { SensitivityLevel, type FieldDefinition } from './definition';

/** The id barakoCMS seeds its SuperAdmin role under (`SystemRoles.SuperAdminRoleId`). */
export const SUPER_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000001';

/** The capability that opens a Sensitive field with no role list of its own. */
export const VIEW_SENSITIVE = 'view_sensitive';

/** The capability that opens a Hidden field with no role list of its own. */
export const VIEW_HIDDEN = 'view_hidden';

/**
 * Who is looking at the screen, as far as the host knows.
 *
 * `roles` are role names, which is what a field's `visibleToRoles` holds on the wire. `capabilities`
 * and `roleIds` are the caller's in the current tenant. Leave `capabilities` out when the host does
 * not know them: the decision then falls back to role names, the rule an API before 4.6 enforced.
 */
export interface Viewer {
    roles: readonly string[];
    roleIds?: readonly string[];
    capabilities?: readonly string[];
}

/**
 * Whether the person looking at the screen may read and set a field.
 *
 * A copy of what barakoCMS enforces in `SensitivityService`, and a copy on purpose: the API
 * publishes the definition, including `sensitivity` and `visibleToRoles`, but not the decision it
 * made about them. The read path masks the value and the write path puts the stored value back over
 * whatever was sent, so a form that draws an editable box here offers an edit the server discards.
 *
 * With capabilities known (API 4.6 on): the seeded SuperAdmin role, by id, sees every field. A
 * field that lists roles is seen by those roles only. Otherwise a Sensitive field needs
 * `view_sensitive` and a Hidden one `view_hidden`, and `*` satisfies both.
 *
 * Without them, the older rule by name: SuperAdmin sees everything, HR reads an unlisted Sensitive
 * field, and nobody else reads an unlisted Hidden one.
 */
export function fieldIsVisibleTo(field: FieldDefinition, viewer: readonly string[] | Viewer): boolean {
    const level = field.sensitivity;
    if (!level || level === SensitivityLevel.Public) return true;

    const who: Viewer = isRoleList(viewer) ? { roles: viewer } : viewer;
    const listed = field.visibleToRoles && field.visibleToRoles.length > 0 ? field.visibleToRoles : null;

    if (!who.capabilities) {
        if (who.roles.includes('SuperAdmin')) return true;
        const allowed = listed ?? (level === SensitivityLevel.Sensitive ? ['HR'] : []);
        return allowed.some((role) => who.roles.includes(role));
    }

    const superAdmin = who.roleIds ? who.roleIds.includes(SUPER_ADMIN_ROLE_ID) : who.roles.includes('SuperAdmin');
    if (superAdmin) return true;
    if (listed) return listed.some((role) => who.roles.includes(role));

    const needed = level === SensitivityLevel.Hidden ? VIEW_HIDDEN : VIEW_SENSITIVE;
    return who.capabilities.some((held) => {
        const name = held.toLowerCase();
        return name === '*' || name === needed;
    });
}

function isRoleList(viewer: readonly string[] | Viewer): viewer is readonly string[] {
    return Array.isArray(viewer);
}

/** What to tell somebody standing in front of a field they cannot read. */
export function maskedNotice(field: FieldDefinition): string {
    const level = field.sensitivity === SensitivityLevel.Hidden ? 'Hidden' : 'Sensitive';
    return `${level}. You cannot read this field, so it is shown as the API sent it and cannot be changed here. Saving the entry leaves the stored value alone.`;
}
