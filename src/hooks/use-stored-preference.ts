'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A small per-browser choice, such as which way a list is drawn.
 *
 * Read through useSyncExternalStore with a null server snapshot, the same shape as the What's new
 * dot, so a preference read during SSR does not become a hydration mismatch. A browser that refuses
 * storage (private windows, blocked site data) keeps the fallback and nothing throws.
 *
 * Per browser rather than per account: it is a view preference, and the API has nowhere to put it.
 */
const listeners = new Map<string, Set<() => void>>();

function subscribers(key: string) {
    let set = listeners.get(key);
    if (!set) {
        set = new Set();
        listeners.set(key, set);
    }
    return set;
}

export function useStoredPreference<T extends string>(
    key: string,
    allowed: readonly T[],
    fallback: T
): [T, (value: T) => void] {
    const subscribe = useCallback(
        (onChange: () => void) => {
            subscribers(key).add(onChange);
            return () => {
                subscribers(key).delete(onChange);
            };
        },
        [key]
    );

    const snapshot = useCallback(() => {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }, [key]);

    const stored = useSyncExternalStore(subscribe, snapshot, () => null);

    const set = useCallback(
        (value: T) => {
            try {
                localStorage.setItem(key, value);
            } catch {
                /* a browser that will not remember it still has to work */
            }
            subscribers(key).forEach((l) => l());
        },
        [key]
    );

    return [allowed.includes(stored as T) ? (stored as T) : fallback, set];
}
