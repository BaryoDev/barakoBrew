'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * A readable name for the last breadcrumb, supplied by the page that knows it.
 *
 * Crumbs are derived from the path, which is right everywhere except the screens whose last segment
 * is an id. `/content/4f6c2a90-...` put a raw uuid in the header of the entry editor, which is the
 * one screen a person with no interest in the API spends their day on.
 *
 * The title is recorded against the path it was set for. Next keeps a client component mounted
 * across a navigation within the same route, so a title left behind by the previous entry would
 * otherwise be the title of the next one for a frame or two.
 *
 * `usePathname` is called here rather than in `useSetCrumbTitle`, so a screen can name its crumb
 * without that becoming a router dependency of every test that renders the screen. Outside a
 * provider the setter is a no-op and nothing reaches for the router at all.
 */
const CrumbTitleContext = createContext<{
    entry: { pathname: string; title: string } | null;
    set: (title: string | null) => void;
}>({ entry: null, set: () => {} });

export function CrumbTitleProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [entry, setEntry] = useState<{ pathname: string; title: string } | null>(null);

    const set = useCallback(
        (title: string | null) => setEntry(title ? { pathname, title } : null),
        [pathname]
    );

    return <CrumbTitleContext.Provider value={{ entry, set }}>{children}</CrumbTitleContext.Provider>;
}

/** The title the current screen gave its own crumb, or undefined to keep the path segment. */
export function useCrumbTitle(pathname: string): string | undefined {
    const { entry } = useContext(CrumbTitleContext);
    return entry?.pathname === pathname ? entry.title : undefined;
}

/** Names the last crumb from a screen that knows better than the URL does. */
export function useSetCrumbTitle(title: string | undefined) {
    const { set } = useContext(CrumbTitleContext);

    useEffect(() => {
        if (!title) return;
        set(title);
        return () => set(null);
    }, [title, set]);
}
