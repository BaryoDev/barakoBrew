import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SIDEBAR_DRAWER_BREAKPOINT, useIsMobile, useIsSidebarDrawer } from '@/hooks/use-mobile';
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
