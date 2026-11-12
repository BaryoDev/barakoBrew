import type { ContentTypePermission, PermissionAction } from '@/types/rbac';
import type { ContentTypeDefinition } from '@/types/schema';
import { capabilityLabel } from '@/lib/capabilities';
import { readConditions, ruleSentence } from '@/lib/role-rules';

export type SentenceTone = 'accent' | 'ok' | 'warn' | 'muted';

export interface RoleSentence {
    tone: SentenceTone;
    text: string;
}

const ACTIONS: PermissionAction[] = ['create', 'read', 'update', 'delete'];

function joined(items: readonly string[]): string {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Reads a role back as plain sentences, for the "Reads back as" rail. Pure: the same role gives the
 * same sentences, recomputed on every edit. A rule with conditions or a field set gets its own
 * sentence; plain actions on a type are grouped. Rules and transitions use `ruleSentence`, the same
 * wording the editor shows under each rule.
 */
export function roleSentences(input: {
    roleName: string;
    permissions: readonly ContentTypePermission[];
    capabilities: readonly string[];
    schemas?: readonly Pick<ContentTypeDefinition, 'name' | 'displayName'>[];
}): RoleSentence[] {
    const who = input.roleName.trim() || 'This role';
    const out: RoleSentence[] = [];

    for (const permission of input.permissions) {
        const display = input.schemas?.find((s) => s.name === permission.contentTypeSlug)?.displayName ?? permission.contentTypeSlug;

        const plain: PermissionAction[] = [];
        for (const action of ACTIONS) {
            const rule = permission[action];
            if (!rule?.enabled) continue;
            const rows = readConditions(rule.conditions).rows;
            if (rows.length === 0) plain.push(action);
            else out.push({ tone: 'accent', text: ruleSentence(who, action, display, rows) });
        }
        if (plain.length > 0) {
            out.push({ tone: 'accent', text: `${who} can ${joined(plain)} every ${display}.` });
        }

        const readable = permission.read?.enabled ? permission.read.readableFields : null;
        if (readable && readable.length > 0) out.push({ tone: 'warn', text: `${who} sees only ${joined(readable)} on ${display}.` });
        for (const action of ['create', 'update'] as const) {
            const writable = permission[action]?.enabled ? permission[action].writableFields : null;
            if (writable && writable.length > 0) {
                out.push({ tone: 'muted', text: `${who} can set only ${joined(writable)} when they ${action} ${display}.` });
            }
        }

        for (const [name, rule] of Object.entries(permission.transitions ?? {})) {
            if (!rule?.enabled) continue;
            out.push({ tone: 'ok', text: ruleSentence(who, `run ${name} on`, display, readConditions(rule.conditions).rows) });
        }
    }

    for (const capability of input.capabilities) {
        const label = capabilityLabel(capability);
        out.push({
            tone: 'accent',
            text: label === capability ? `${who} holds the ${capability} capability.` : `${who} can ${label.charAt(0).toLowerCase()}${label.slice(1)}.`,
        });
    }

    return out;
}
