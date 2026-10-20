// The vitest entry, not the bare one. Both register the matchers at runtime, but only this one
// augments vitest's own Assertion type, so with the bare import `toBeInTheDocument` type-checks by
// accident under some versions and not others. Under vitest 5 it stopped, and the test run stayed
// green while `tsc --noEmit` failed, which is the wrong way round for a type-only problem.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
    cleanup();
});

/**
 * jsdom has no layout, so `matchMedia` answers from a width the test sets. It starts at a desktop
 * 1280 so a component that reads a media query sees the rail, as it would in a browser. Tests call
 * `setViewportWidth(900)` to cross a breakpoint; listeners fire as they would on a resize.
 */
type Listener = () => void;
const mediaQueries = new Set<{ query: string; listeners: Set<Listener>; matches: () => boolean }>();
let viewportWidth = 1280;

function widthMatches(query: string, width: number): boolean {
    const negated = /^not all and\s*/.exec(query);
    if (negated) return !widthMatches(query.slice(negated[0].length), width);
    const max = /\(max-width:\s*(\d+(?:\.\d+)?)px\)/.exec(query);
    const min = /\(min-width:\s*(\d+(?:\.\d+)?)px\)/.exec(query);
    if (max && width > Number(max[1])) return false;
    if (min && width < Number(min[1])) return false;
    return Boolean(max || min);
}

export function setViewportWidth(width: number) {
    viewportWidth = width;
    for (const mq of mediaQueries) for (const listener of mq.listeners) listener();
}

// Files that opt into the node environment have no window to stub.
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (query: string) => {
            const entry = { query, listeners: new Set<Listener>(), matches: () => widthMatches(query, viewportWidth) };
            mediaQueries.add(entry);
            return {
                get matches() {
                    return entry.matches();
                },
                media: query,
                onchange: null,
                addEventListener: (_: string, listener: Listener) => entry.listeners.add(listener),
                removeEventListener: (_: string, listener: Listener) => entry.listeners.delete(listener),
                addListener: (listener: Listener) => entry.listeners.add(listener),
                removeListener: (listener: Listener) => entry.listeners.delete(listener),
                dispatchEvent: () => false,
            };
        },
    });

    afterEach(() => {
        viewportWidth = 1280;
        mediaQueries.clear();
    });
}

// jsdom has no ResizeObserver, and Radix measures with one as soon as a checkbox, select or popover
// mounts. Tests that need to see a resize install their own.
if (typeof window !== 'undefined') {
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}
