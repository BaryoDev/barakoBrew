'use client';

import { Component as ReactComponent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentTenant } from '@/hooks/use-tenants';
import { useEnabledModules } from '@/hooks/use-modules';
import { useSlot } from '@/hooks/use-slots';
import type { ComponentSlotKind } from '@/lib/extension-slots';

/**
 * An extension that throws takes only its own component down: this renders `fallback`, nothing by
 * default, in its place. The error is logged with the slot and module so it can be found.
 */
class SlotBoundary extends ReactComponent<
  { kind: ComponentSlotKind; module: string; fallback?: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(`Extension slot "${this.props.kind}" for module "${this.props.module}" threw.`, error);
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}

/**
 * Mounts what is registered for a component slot whose module runs, and nothing when there is none.
 * Each component gets the one props shape, `{ tenant, modules, queryClient }`, and no page internals.
 * `only` limits it to one module, for a screen that belongs to the module in its address.
 * `fallback` is drawn in place of a component that threw.
 */
export function ExtensionSlot({ kind, only, fallback }: { kind: ComponentSlotKind; only?: string; fallback?: ReactNode }) {
  const entries = useSlot(kind);
  const tenant = useCurrentTenant();
  const modules = useEnabledModules() ?? [];
  const queryClient = useQueryClient();
  const shown = only === undefined ? entries : entries.filter((entry) => entry.module === only);
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map(({ module, Component }) => (
        <SlotBoundary key={`${tenant ?? ''}:${module}`} kind={kind} module={module} fallback={fallback}>
          <Component tenant={tenant ?? ''} modules={modules} queryClient={queryClient} />
        </SlotBoundary>
      ))}
    </>
  );
}
