import type { ComponentType } from 'react';

/**
 * Extension slots: where a module installed next to the console can add to it without a change to
 * this repo. A build registers components from code at startup. Nothing is fetched from the API or
 * a URL, and a component for a module that `GET /api/modules` does not report as enabled is never
 * mounted. The public build registers none.
 */

/** The one props shape of an `overview-card`: who is looking and which modules run. Nothing else. */
export interface OverviewCardProps {
  tenant: string;
  modules: readonly string[];
}

export interface SlotComponents {
  'overview-card': ComponentType<OverviewCardProps>;
}

export type SlotKind = keyof SlotComponents;

type Entry<K extends SlotKind> = { module: string; Component: SlotComponents[K] };

const registry: { [K in SlotKind]: Entry<K>[] } = { 'overview-card': [] };

/** Register a component for a slot, keyed by the module that owns it. Call it once, at startup. */
export function registerSlot<K extends SlotKind>(kind: K, module: string, Component: SlotComponents[K]): void {
  // One component per module and slot: registering again replaces, so a hot reload cannot stack cards.
  const list = registry[kind] as Entry<K>[];
  const at = list.findIndex((entry) => entry.module === module);
  if (at >= 0) list[at] = { module, Component };
  else list.push({ module, Component });
}

/** What is registered for a slot, whether or not its module runs. */
export function registeredSlots<K extends SlotKind>(kind: K): readonly Entry<K>[] {
  return registry[kind];
}

/** For tests: forget every registration. */
export function resetSlots(): void {
  registry['overview-card'] = [];
}
