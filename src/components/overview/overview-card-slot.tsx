'use client';

import { ExtensionSlot } from '@/components/extension-slot';

/**
 * Where the first Overview card sits. Renders what a module registered for `overview-card` and
 * whose module is running, and nothing at all when there is none.
 */
export function OverviewCardSlot() {
  return <ExtensionSlot kind="overview-card" />;
}
