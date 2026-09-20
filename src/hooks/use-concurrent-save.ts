'use client';

import { useState } from 'react';
import { isConflict } from '@/lib/api';
import {
    saveConcurrently,
    SaveConflictError,
    type SaveAttempt,
    type SaveBase,
    type SaveOutcome,
} from '@/lib/concurrent-save';

/** A save the console would not retry, and what it could not decide. */
export interface SaveConflict {
    /** Keys both sides changed. Empty when the refusal came from the server with nothing to name. */
    fields: string[];
}

/**
 * The one concurrent save flow, with the state a screen needs to show it.
 *
 * `save` writes, moves the edit onto a newer stored value when the server refuses, and writes
 * again. It raises `conflict` only when that cannot be done without losing work, which is when the
 * screen has something to ask. `raise` is for a write with no document to rebase, such as a status
 * change, that the server refused for the same reason.
 */
export function useConcurrentSave() {
    const [conflict, setConflict] = useState<SaveConflict | null>(null);

    const save = async <S extends SaveBase, T>(attempt: SaveAttempt<S, T>): Promise<SaveOutcome<S, T>> => {
        try {
            const outcome = await saveConcurrently(attempt);
            setConflict(null);
            return outcome;
        } catch (error) {
            if (error instanceof SaveConflictError) setConflict({ fields: error.fields });
            else if (isConflict(error)) setConflict({ fields: [] });
            throw error;
        }
    };

    return {
        save,
        conflict,
        raise: () => setConflict({ fields: [] }),
        clear: () => setConflict(null),
    };
}

/** What the banner says a refused save could not decide. */
export function conflictReason(conflict: SaveConflict): string {
    return conflict.fields.length > 0
        ? `Someone else changed ${conflict.fields.join(', ')} while you were editing.`
        : 'This changed while you were editing.';
}
