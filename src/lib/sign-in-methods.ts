/**
 * The ways in that `GET /api/auth/methods` lists, and which of them the console can draw.
 *
 * The server owns the ids and they are public API (BaryoDev/barakoCMS#1253). The console owns the
 * labels and the panels. A tab exists only when both agree: the server lists the id and a panel is
 * registered under it. A listed id with no panel adds nothing, so an instance running a module the
 * console has never heard of still signs in.
 */

/** What an API that predates the endpoint offers, and what the console always offered before it. */
export const DEFAULT_METHOD_IDS: readonly string[] = ['password', 'email-code'];

/**
 * The ids out of a `/api/auth/methods` reply, in the server's order and without repeats.
 * Null when the reply is not the documented shape, so the caller can tell "none listed" from
 * "could not read it".
 */
export function readMethodIds(value: unknown): string[] | null {
    if (!value || typeof value !== 'object') return null;
    const methods = (value as { methods?: unknown }).methods;
    if (!Array.isArray(methods)) return null;
    const ids: string[] = [];
    for (const item of methods) {
        if (typeof item !== 'string') continue;
        const id = item.trim().toLowerCase();
        if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
}

/** The registry entries that get a tab: listed by the server and registered here, server order. */
export function tabsFor<T>(listed: readonly string[], registry: Readonly<Record<string, T>>): T[] {
    const tabs: T[] = [];
    for (const id of listed) {
        if (Object.hasOwn(registry, id)) tabs.push(registry[id]);
    }
    return tabs;
}
