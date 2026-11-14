import type { ContentTypePermission, PermissionAction } from '@/types/rbac';
import type { ContentTypeDefinition } from '@/types/schema';
import { capabilityLabel } from '@/lib/capabilities';
import { readConditions, ruleSentence } from '@/lib/role-rules';

export type SentenceTone = 'accent' | 'ok' | 'warn' | 'muted';

export interface RoleSentence {
    tone: SentenceTone;
    text: string;
}

/**
 * One rule's sentence. Conditions the editor cannot draw are kept as stored and still enforced, so a
 * rule holding any says so and is never read as unconditional.
 */
function ruleLine(who: string, verb: string, display: string, conditions: Record<string, unknown> | null | undefined) {
    const { rows, kept } = readConditions(conditions);
    const hidden = Object.keys(kept).length;
    const base = ruleSentence(who, verb, display, rows);
    if (hidden === 0) return { text: base, hasKept: false };
    const more = `${hidden} ${rows.length > 0 ? 'more ' : ''}${hidden === 1 ? 'condition' : 'conditions'} this screen cannot show`;
    const text =
        rows.length > 0
            ? `${base.slice(0, -1)} and ${more}.`
            : `${who} can ${verb} ${display}, limited by ${more}.`;
    return { text, hasKept: true };
}

const ACTIONS: PermissionAction[] = ['create', 'read', 'update', 'delete'];

function notValid(who: string, verb: string, display: string): string {
    return `${who} can ${verb} ${display} only once its unsaved condition is valid. It is not saved yet.`;
}

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
    /**
     * Rules whose unsaved condition the editor will not save yet, as `slug:action` or
     * `slug:transition:name`. Each reads as not valid yet, never as granted.
     */
    invalid?: ReadonlySet<string>;
}): RoleSentence[] {
    const who = input.roleName.trim() || 'This role';
    const out: RoleSentence[] = [];

    for (const permission of input.permissions) {
        const display = input.schemas?.find((s) => s.name === permission.contentTypeSlug)?.displayName ?? permission.contentTypeSlug;

        const plain: PermissionAction[] = [];
        for (const action of ACTIONS) {
            const rule = permission[action];
            if (!rule?.enabled) continue;
            if (input.invalid?.has(`${permission.contentTypeSlug}:${action}`)) {
                out.push({ tone: 'warn', text: notValid(who, action, display) });
                continue;
            }
            const line = ruleLine(who, action, display, rule.conditions);
            if (line.hasKept) out.push({ tone: 'warn', text: line.text });
            else if (line.text === ruleSentence(who, action, display, [])) plain.push(action);
            else out.push({ tone: 'accent', text: line.text });
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
            const verb = `run ${name} on`;
            if (input.invalid?.has(`${permission.contentTypeSlug}:transition:${name}`)) {
                out.push({ tone: 'warn', text: notValid(who, verb, display) });
                continue;
            }
            const line = ruleLine(who, verb, display, rule.conditions);
            out.push({ tone: line.hasKept ? 'warn' : 'ok', text: line.text });
        }
    }

    for (const capability of input.capabilities) {
        if (capability === '*') {
            out.push({ tone: 'accent', text: `${who} holds every capability.` });
            continue;
        }
        const label = capabilityLabel(capability);
        out.push({
            tone: 'accent',
            text: label === capability ? `${who} holds the ${capability} capability.` : `${who} can ${label.charAt(0).toLowerCase()}${label.slice(1)}.`,
        });
    }

    return out;
}
