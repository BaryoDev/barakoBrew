'use client';

import { Component as ReactComponent, type ReactNode } from 'react';
import { useCurrentTenant } from '@/hooks/use-tenants';
import { useEnabledModules } from '@/hooks/use-modules';
import { useSlot } from '@/hooks/use-slots';

/** An extension that throws takes only its own card down: this renders nothing in its place. */
class SlotBoundary extends ReactComponent<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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
        <SlotBoundary key={module}>
          <Component tenant={tenant ?? ''} modules={modules} />
        </SlotBoundary>
      ))}
    </>
  );
}
