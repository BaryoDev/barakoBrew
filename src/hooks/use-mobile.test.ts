import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SIDEBAR_DRAWER_BREAKPOINT, belowQuery, useIsMobile, useIsSidebarDrawer } from '@/hooks/use-mobile';
import { setViewportWidth } from '@/test/setup';

describe('useIsMobile', () => {
    it('still flips at 768 for its other callers', () => {
        const flips = [
            [767, true],
            [768, false],
            [900, false],
            [1100, false],
        ] as const;
        expect(flips).toHaveLength(4);

        for (const [width, expected] of flips) {
            setViewportWidth(width);
            const { result, unmount } = renderHook(() => useIsMobile());
            expect(result.current, `at ${width}px`).toBe(expected);
            unmount();
        }
    });

    it('follows a resize across 768 and not across 1000', () => {
        setViewportWidth(1100);
        const { result } = renderHook(() => useIsMobile());
        expect(result.current).toBe(false);

        act(() => setViewportWidth(900));
        expect(result.current).toBe(false);

        act(() => setViewportWidth(700));
        expect(result.current).toBe(true);
    });
});

describe('useIsSidebarDrawer', () => {
    it('flips at 1000, so 900 is a drawer and 1100 is a rail', () => {
        const flips = [
            [767, true],
            [900, true],
            [999, true],
            [1000, false],
            [1100, false],
        ] as const;
        expect(flips).toHaveLength(5);
        expect(SIDEBAR_DRAWER_BREAKPOINT).toBe(1000);

        for (const [width, expected] of flips) {
            setViewportWidth(width);
            const { result, unmount } = renderHook(() => useIsSidebarDrawer());
            expect(result.current, `at ${width}px`).toBe(expected);
            unmount();
        }
    });
});

describe('the drawer breakpoint', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const railBreakpoint = /--breakpoint-rail:\s*([\d.]+)px;/.exec(css);

    it('is declared in px in globals.css, the same unit the hook uses', () => {
        expect(railBreakpoint).not.toBeNull();
        expect(Number(railBreakpoint![1])).toBe(SIDEBAR_DRAWER_BREAKPOINT);
    });

    it('is the exact negation of the min-width query the rail: variant compiles to', () => {
        const railQuery = `(min-width: ${railBreakpoint![1]}px)`;
        expect(belowQuery(SIDEBAR_DRAWER_BREAKPOINT)).toBe(`not all and ${railQuery}`);
    });

    it('leaves no width where neither the rail nor the drawer shows', () => {
        const widths = [999, 999.5, 999.99, 1000, 1000.5];
        expect(widths).toHaveLength(5);
        for (const width of widths) {
            setViewportWidth(width);
            const { result, unmount } = renderHook(() => useIsSidebarDrawer());
            expect(result.current, `at ${width}px`).toBe(width < 1000);
            unmount();
        }
    });
});
