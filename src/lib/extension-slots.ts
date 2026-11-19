import type { ComponentType } from 'react';
import { registerSignInMethod } from '@/components/sign-in/registry';
import type { SignInMethodEntry } from '@/components/sign-in/types';

/**
 * Extension slots: where a module installed next to the console can add to it without a change to
 * this repo. A build registers components from code at startup. Nothing is fetched from the API or
 * a URL, and a component for a module that `GET /api/modules` does not report as enabled is never
 * mounted. The public build registers none.
 *
 * `sign-in-method` is the exception to the module rule: the sign-in page has no signed-in caller, so
 * `GET /api/modules` is closed to it. That slot is gated by `GET /api/auth/methods` instead.
 */

/** The one props shape of an `overview-card`: who is looking and which modules run. Nothing else. */
export interface OverviewCardProps {
  tenant: string;
  modules: readonly string[];
}

export interface SlotComponents {
  'overview-card': ComponentType<OverviewCardProps>;
}

/** Slots that hold a component mounted when its module runs. */
export type ComponentSlotKind = keyof SlotComponents;

/** Slots whose entry is a record, not a bare component. */
export interface SlotEntries {
  'sign-in-method': SignInMethodEntry;
}

export type SlotKind = ComponentSlotKind | keyof SlotEntries;

type Entry<K extends ComponentSlotKind> = { module: string; Component: SlotComponents[K] };

const registry: { [K in ComponentSlotKind]: Entry<K>[] } = { 'overview-card': [] };

/** Register a component for a slot, keyed by the module that owns it. Call it once, at startup. */
export function registerSlot(kind: 'sign-in-method', module: string, entry: SignInMethodEntry): void;
export function registerSlot<K extends ComponentSlotKind>(kind: K, module: string, Component: SlotComponents[K]): void;
export function registerSlot(kind: SlotKind, module: string, value: unknown): void {
  if (kind === 'sign-in-method') {
    // Maps onto the sign-in registry, which validates the entry. The module name is not used: the
    // page gates this slot on the ids the server lists.
    registerSignInMethod(value as SignInMethodEntry);
    return;
  }
  const Component = value as SlotComponents['overview-card'];
  // One component per module and slot: registering again replaces, so a hot reload cannot stack cards.
  const list = registry[kind] as Entry<'overview-card'>[];
  const at = list.findIndex((entry) => entry.module === module);
  if (at >= 0) list[at] = { module, Component };
  else list.push({ module, Component });
}

/** What is registered for a slot, whether or not its module runs. */
export function registeredSlots<K extends ComponentSlotKind>(kind: K): readonly Entry<K>[] {
  return registry[kind];
}

/** For tests: forget every registration. */
export function resetSlots(): void {
  registry['overview-card'] = [];
}
