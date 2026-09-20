import { isConflict } from '@/lib/api';
import { rebaseEdit, type Collision } from '@/lib/rebase';

/**
 * One flow for a refused save.
 *
 * The API answers 412 when what is being written has moved on since it was read, and the console
 * used to answer that in three places in three ways: the entry editor raised a banner, the Site and
 * Theme screens rebased each edited key by hand, and Pages threw and reloaded the tree. Three
 * answers to one event is how two of them drift and one of them quietly wins.
 *
 * The flow is the same everywhere now. Write. If the server refuses, read what is stored, move the
 * edit onto it key by key, and write again. If a key cannot be moved, because both sides changed
 * it, refuse and name the keys so the screen can ask.
 */

/** The entry as a screen read it: what the edit is written against. */
export interface SaveBase {
    data: Record<string, unknown>;
    version: number;
    /** Absent for an event-sourced type, which the API deliberately emits no ETag for. */
    etag?: string;
}

/** A save the console refused to retry, because moving the edit forward would lose somebody's work. */
export class SaveConflictError extends Error {
    constructor(readonly fields: Collision[]) {
        super(
            fields.length > 0
                ? `Someone else changed ${fields.join(', ')} while you were editing.`
                : 'Someone else changed this while you were editing.',
        );
        this.name = 'SaveConflictError';
    }
}

export interface SaveAttempt<S extends SaveBase, T> {
    /** The entry as the screen read it, key by key. */
    base: S;
    /** The entry as the screen holds it now, the whole document rather than the changed keys. */
    edit: Record<string, unknown>;
    /** Reads the entry again. Called only when a write is refused. */
    read: () => Promise<S>;
    write: (data: Record<string, unknown>, against: S) => Promise<T>;
}

export interface SaveOutcome<S extends SaveBase, T> {
    result: T;
    /** What was written: the edit, or the edit moved onto what was stored at the time. */
    data: Record<string, unknown>;
    /** What it was written against. A screen re-seeds from this so its next save is not stale. */
    against: S;
    rebased: boolean;
}

/**
 * Saves once, and once more on a 412 when the edit can be moved forward.
 *
 * One retry, never a loop. A second refusal means a third save landed between the read and the
 * write, and answering that by reading and writing again is how a console gets into a race it
 * cannot win. It comes back as a conflict the person decides.
 */
export async function saveConcurrently<S extends SaveBase, T>({
    base,
    edit,
    read,
    write,
}: SaveAttempt<S, T>): Promise<SaveOutcome<S, T>> {
    try {
        return { result: await write(edit, base), data: edit, against: base, rebased: false };
    } catch (error) {
        if (!isConflict(error)) throw error;

        const stored = await read();
        const { data, collisions } = rebaseEdit(base.data, edit, stored.data);
        if (collisions.length > 0) throw new SaveConflictError(collisions);

        return { result: await write(data, stored), data, against: stored, rebased: true };
    }
}
