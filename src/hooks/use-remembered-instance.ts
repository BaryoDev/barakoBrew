'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
    forgetInstance,
    isForeign,
    parseRemembered,
    readRememberedRaw,
    subscribeRemembered,
    type RememberedInstance,
} from '@/lib/remembered-instance';

/**
 * The facts this browser kept from signing in to `origin`, or null on a first visit. Null on the
 * server too, so the first paint is the first-visit card and hydration agrees.
 *
 * A record kept for a different origin is cleared here: the console was pointed somewhere else, so
 * what it knew about the last instance is not about this one.
 */
export function useRememberedInstance(origin: string | null): {
    remembered: RememberedInstance | null;
    forget: () => void;
} {
    const raw = useSyncExternalStore(subscribeRemembered, readRememberedRaw, () => null);
    const remembered = useMemo(() => parseRemembered(raw, origin), [raw, origin]);

    useEffect(() => {
        if (isForeign(raw, origin)) forgetInstance();
    }, [raw, origin]);

    return { remembered, forget: forgetInstance };
}
