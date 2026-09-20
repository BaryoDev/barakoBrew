/**
 * Moving an unsaved edit onto a newer stored value.
 *
 * Every screen that saves an entry reads it, is edited, and then has to cope with the entry having
 * moved on underneath. What can be moved forward is moved forward here, key by key, so someone
 * else's unrelated change survives a save. What cannot is named, so the screen can ask rather than
 * pick a winner on the editor's behalf.
 *
 * This used to live in `site-settings.ts` and be reachable only from the Site and Theme screens.
 */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const sameValue = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** A key both sides changed, to different values. Nested keys read as `Colors.accent`. */
export type Collision = string;

export interface Rebase {
    /** The stored value with this edit laid over it. */
    data: Record<string, unknown>;
    /** Keys this could not decide. Empty means the merge is safe to save. */
    collisions: Collision[];
}

/**
 * Lays one map edit over a newer stored map, key by key.
 *
 * `base` is the stored map the edit was made from, `edit` is the map as the screen holds it now,
 * and `stored` is what the server holds now. A key the edit did not touch keeps what is stored, so
 * their new key survives. A key only the edit touched takes the edit. A key both changed, to
 * different values, is a collision: the edit is kept in `data` so nothing typed is thrown away, and
 * the key is named so the caller can refuse the save and ask.
 *
 * Maps nest, so a field holding a map, such as one content type's entry in OptionColors, is moved
 * forward the same way and its collisions are named with the path.
 */
export function rebaseEdit(
    base: Record<string, unknown>,
    edit: Record<string, unknown>,
    stored: Record<string, unknown>,
): Rebase {
    const collisions: Collision[] = [];
    const data: Record<string, unknown> = { ...stored };

    for (const [key, mine] of Object.entries(edit)) {
        if (sameValue(base[key], mine)) continue;

        const theirsChanged = !sameValue(base[key], stored[key]);
        if (!theirsChanged || sameValue(mine, stored[key])) {
            data[key] = mine;
            continue;
        }

        if (isPlainObject(base[key]) && isPlainObject(mine) && isPlainObject(stored[key])) {
            const inner = rebaseEdit(base[key], mine, stored[key]);
            data[key] = inner.data;
            collisions.push(...inner.collisions.map((path) => `${key}.${path}`));
            continue;
        }

        data[key] = mine;
        collisions.push(key);
    }

    // A key the edit removed. Removing it while they changed it is as much a disagreement as two
    // different values, so it is named rather than quietly winning either way.
    for (const key of Object.keys(base)) {
        if (key in edit) continue;
        if (key in stored && !sameValue(base[key], stored[key])) collisions.push(key);
        delete data[key];
    }

    return { data, collisions };
}

/**
 * An edit to a JSON map, moved onto a newer stored value key by key.
 *
 * The same merge as `rebaseEdit`, keeping the edit on a collision and saying nothing about it.
 * This is what a screen lays over the value it is displaying, where there is no save to refuse and
 * no question to ask yet. A value that is not a plain object on any side is replaced whole.
 */
export function rebaseMapEdit(base: unknown, edit: unknown, stored: unknown): unknown {
    if (!isPlainObject(edit) || !isPlainObject(stored) || sameValue(base, stored)) return edit;
    return rebaseEdit(isPlainObject(base) ? base : {}, edit, stored).data;
}
