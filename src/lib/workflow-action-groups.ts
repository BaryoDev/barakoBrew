import type { WorkflowActionMetadata } from '@/types/workflow';

/**
 * The action library's groups, in the order the builder lists them. The API says which group a kind
 * is in; the console only orders the groups, so no kind names live here.
 */
export const ACTION_GROUP_ORDER = ['Content', 'Delivery', 'Comms', 'Data', 'Flow'] as const;

/** Where an action with no group, or a group this console does not know, is listed. Always last. */
export const OTHER_ACTION_GROUP = 'Other';

export interface ActionGroup {
    name: string;
    actions: WorkflowActionMetadata[];
}

export function groupActions(actions: WorkflowActionMetadata[]): ActionGroup[] {
    const known: readonly string[] = ACTION_GROUP_ORDER;
    const byName = new Map<string, WorkflowActionMetadata[]>();
    for (const action of actions) {
        const name = action.group && known.includes(action.group) ? action.group : OTHER_ACTION_GROUP;
        byName.set(name, [...(byName.get(name) ?? []), action]);
    }
    return [...ACTION_GROUP_ORDER, OTHER_ACTION_GROUP]
        .filter((name) => byName.has(name))
        .map((name) => ({ name, actions: byName.get(name)! }));
}
