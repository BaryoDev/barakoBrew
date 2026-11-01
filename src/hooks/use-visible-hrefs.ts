'use client';

import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAccess } from '@/hooks/use-access';
import { useEnabledModules } from '@/hooks/use-modules';
import { useActivityAvailable } from '@/hooks/use-activity';
import { NAV_GROUPS, visibleGroups, withModules, withoutHrefs, type NavGroup } from '@/lib/navigation';

const NO_HREFS: ReadonlySet<string> = new Set();
const WITHOUT_ACTIVITY: ReadonlySet<string> = new Set(['/activity']);

/**
 * The nav groups this caller is offered: filtered by role or capability, then by the modules the
 * deployment runs. The rail and the Overview both ask what a caller may reach through this.
 */
export function useAllowedGroups(): NavGroup[] {
  const { user } = useAuth();
  const access = useAccess();
  const modules = useEnabledModules();
  const activity = useActivityAvailable();
  return useMemo(
    () =>
      withoutHrefs(
        withModules(visibleGroups(NAV_GROUPS, user?.roles, access.known ? access.can : undefined), modules),
        activity ? NO_HREFS : WITHOUT_ACTIVITY,
      ),
    [user?.roles, access.known, access.can, modules, activity],
  );
}

export function hrefsOf(groups: readonly NavGroup[]): ReadonlySet<string> {
  return new Set(groups.flatMap((g) => g.items.map((i) => i.href)));
}
