/**
 * An audit entry's metadata as lines a person can read.
 *
 * barakoCMS records role, API key, membership and field access changes with role ids beside role
 * names and with long lists capped: `{ items, count, truncated }` keeps the first 50 and the full
 * count (`RoleAudit`). Ids and names are paired back up here, a capped list says how many it left
 * out, and a permission reads as its content type and actions. A key this does not know is shown
 * under its own name, so a newer API's entry loses nothing.
 */
export interface AuditDetail {
    label: string;
    /** One line for most entries; one per permission for a role's permissions. */
    lines: string[];
}

/** Keys holding role ids, and the key that holds the names in the same order. */
const ROLE_PAIRS: [ids: string, names: string, label: string][] = [
    ['roleIds', 'roleNames', 'Roles'],
    ['previousRoleIds', 'previousRoleNames', 'Roles before'],
    ['visibleToRoleIds', 'visibleToRoles', 'Visible to'],
    ['visibleToRoleIdsFrom', 'visibleToRolesFrom', 'Visible to before'],
    ['visibleToRoleIdsTo', 'visibleToRolesTo', 'Visible to after'],
];

const LABELS: Record<string, string> = {
    name: 'Name',
    nameBefore: 'Name before',
    capabilities: 'Capabilities',
    capabilitiesBefore: 'Capabilities before',
    capabilitiesAfter: 'Capabilities after',
    capabilitiesAdded: 'Capabilities added',
    capabilitiesRemoved: 'Capabilities removed',
    permissions: 'Permissions',
    permissionsBefore: 'Permissions before',
    permissionsAfter: 'Permissions after',
    conditionsChanged: 'Conditions changed',
    conditionsChangedIn: 'Conditions changed on',
    previousStatus: 'Status before',
    status: 'Status',
    profileAdded: 'Profile fields added',
    profileRemoved: 'Profile fields removed',
    profileChanged: 'Profile fields changed',
    scopes: 'Scopes',
    contentTypes: 'Content types',
    actsAsUserId: 'Acts as user',
    expiresAt: 'Expires',
    contentType: 'Content type',
    field: 'Field',
    type: 'Field type',
    required: 'Required',
    sensitivity: 'Sensitivity',
    from: 'Level before',
    to: 'Level after',
    maskFrom: 'Mask before',
    maskTo: 'Mask after',
    publiclyDeliverable: 'Publicly delivered',
};

interface Capped {
    items: unknown[];
    count: number;
    truncated: boolean;
}

function isCapped(value: unknown): value is Capped {
    return (
        typeof value === 'object' &&
        value !== null &&
        Array.isArray((value as Capped).items) &&
        typeof (value as Capped).count === 'number'
    );
}

/** The items of a list, capped or plain, and how many the entry left out. */
function itemsOf(value: unknown): { items: unknown[]; more: number } | null {
    if (Array.isArray(value)) return { items: value, more: 0 };
    if (isCapped(value)) return { items: value.items, more: Math.max(0, value.count - value.items.length) };
    return null;
}

function joined(parts: string[], more: number): string {
    if (parts.length === 0 && more === 0) return 'none';
    const text = parts.join(', ');
    return more > 0 ? `${text} and ${more} more` : text;
}

function scalar(value: unknown): string {
    if (value === null || value === undefined || value === '') return 'none';
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return JSON.stringify(value);
}

function roleName(id: unknown, name: unknown): string {
    const n = typeof name === 'string' ? name : '';
    const i = typeof id === 'string' ? id : '';
    if (n && i) return `${n} (${i})`;
    if (n) return `${n} (no such role)`;
    return i ? `deleted role (${i})` : 'unknown';
}

/** One permission as `RoleAudit` describes it: content type, actions, transitions, condition shapes. */
function permissionLine(value: unknown): string {
    if (typeof value !== 'object' || value === null) return scalar(value);
    const p = value as Record<string, unknown>;
    const actions = itemsOf(p.actions)?.items.map(String) ?? [];
    const transitions = itemsOf(p.transitions);
    const conditions = itemsOf(p.conditions);
    const fieldSets = itemsOf(p.fieldSets);

    let line = `${scalar(p.contentType)}: ${actions.length > 0 ? actions.join(', ') : 'no actions'}`;
    if (transitions && transitions.items.length > 0) {
        line += `; transitions ${joined(transitions.items.map(String), transitions.more)}`;
    }
    if (conditions && conditions.items.length > 0) {
        const shown = conditions.items.map((c) => {
            const cond = (c ?? {}) as Record<string, unknown>;
            const ops = itemsOf(cond.operators)?.items.map(String).join(' ') ?? '';
            const on = cond.transition ? `${scalar(cond.rule)} ${scalar(cond.transition)}` : scalar(cond.rule);
            return `${on} when ${scalar(cond.field)} ${ops}`.trim();
        });
        line += `; conditions: ${joined(shown, conditions.more)}`;
    }
    if (fieldSets && fieldSets.items.length > 0) {
        const shown = fieldSets.items.map((s) => {
            const set = (s ?? {}) as Record<string, unknown>;
            const fields = itemsOf(set.fields);
            return `${scalar(set.rule)} ${scalar(set.access)} ${fields ? joined(fields.items.map(String), fields.more) : ''}`.trim();
        });
        line += `; field limits: ${joined(shown, fieldSets.more)}`;
    }
    return line;
}

export function auditDetails(metadata: Record<string, unknown> | null | undefined): AuditDetail[] {
    if (!metadata) return [];
    const details: AuditDetail[] = [];
    const done = new Set<string>();

    for (const [idsKey, namesKey, label] of ROLE_PAIRS) {
        if (!(idsKey in metadata) && !(namesKey in metadata)) continue;
        done.add(idsKey);
        done.add(namesKey);
        const ids = itemsOf(metadata[idsKey]);
        const names = itemsOf(metadata[namesKey]);
        const length = Math.max(ids?.items.length ?? 0, names?.items.length ?? 0);
        const parts = Array.from({ length }, (_, i) => roleName(ids?.items[i], names?.items[i]));
        details.push({ label, lines: [joined(parts, Math.max(ids?.more ?? 0, names?.more ?? 0))] });
    }

    if ('roleId' in metadata || 'roleName' in metadata) {
        done.add('roleId');
        done.add('roleName');
        details.push({ label: 'Role', lines: [roleName(metadata.roleId, metadata.roleName)] });
    }

    for (const [key, value] of Object.entries(metadata)) {
        if (done.has(key)) continue;
        const label = LABELS[key] ?? key;
        const list = itemsOf(value);
        if (key.startsWith('permissions') && list) {
            const lines = list.items.map(permissionLine);
            if (list.more > 0) lines.push(`and ${list.more} more`);
            details.push({ label, lines: lines.length > 0 ? lines : ['none'] });
            continue;
        }
        details.push({ label, lines: [list ? joined(list.items.map(scalar), list.more) : scalar(value)] });
    }

    return details;
}
