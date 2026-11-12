'use client';

import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAccess } from '@/hooks/use-access';
import { useEnabledModules } from '@/hooks/use-modules';
import { useActivityGone } from '@/hooks/use-activity';
import { NAV_GROUPS, visibleGroups, withModules, type NavGroup } from '@/lib/navigation';

/**
 * The nav groups this caller is offered: filtered by role or capability, then by the modules the
 * deployment runs. The rail and the Overview both ask what a caller may reach through this.
 */
export function useAllowedGroups(): NavGroup[] {
  const { user } = useAuth();
  const access = useAccess();
  const modules = useEnabledModules();
  const offered = useMemo(
    () => withModules(visibleGroups(NAV_GROUPS, user?.roles, access.known ? access.can : undefined), modules),
    [user?.roles, access.known, access.can, modules],
  );
  // Ask the feed once, and only for a caller who is offered it, so an API older than 5.5 loses the
  // Activity item instead of leaving a link to a 404.
  const wantsActivity = hrefsOf(offered).has('/activity');
  const missing = useActivityGone(wantsActivity);
  return useMemo(
    () => (missing ? offered.map((g) => ({ ...g, items: g.items.filter((i) => i.href !== '/activity') })) : offered),
    [offered, missing],
  );
}

export function hrefsOf(groups: readonly NavGroup[]): ReadonlySet<string> {
  return new Set(groups.flatMap((g) => g.items.map((i) => i.href)));
}
