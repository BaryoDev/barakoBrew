import * as React from "react"

const MOBILE_BREAKPOINT = 768

/** Below this width the sidebar is a drawer. Matches the `rail:` breakpoint in globals.css. */
export const SIDEBAR_DRAWER_BREAKPOINT = 1000

function createBelowHook(breakpoint: number) {
  const query = `(max-width: ${breakpoint - 1}px)`

  function subscribe(onChange: () => void) {
    const mql = window.matchMedia(query)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }

  const getSnapshot = () => window.matchMedia(query).matches

  // Assume desktop while rendering on the server; the client corrects it on hydration.
  const getServerSnapshot = () => false

  return () => React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export const useIsMobile = createBelowHook(MOBILE_BREAKPOINT)

export const useIsSidebarDrawer = createBelowHook(SIDEBAR_DRAWER_BREAKPOINT)
