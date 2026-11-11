'use client';

import { useCurrentTenant } from '@/hooks/use-tenants';
import { useEnabledModules } from '@/hooks/use-modules';
import { useSlot } from '@/hooks/use-slots';

/**
 * Where the first Overview card sits. Renders what a module registered for `overview-card` and
 * whose module is running, and nothing at all when there is none. It hands each component the
 * tenant and the module names, not page internals.
 */
export function OverviewCardSlot() {
  const cards = useSlot('overview-card');
  const tenant = useCurrentTenant();
  const modules = useEnabledModules() ?? [];
  if (cards.length === 0) return null;
  return (
    <>
      {cards.map(({ module, Component }) => (
        <Component key={module} tenant={tenant ?? ''} modules={modules} />
      ))}
    </>
  );
}
