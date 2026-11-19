'use client';

import { ExtensionSlot } from '@/components/extension-slot';
import { useSlot } from '@/hooks/use-slots';

/** True when a screen is registered for this module and the module runs. */
export function useHasModuleScreen(name: string): boolean {
  return useSlot('module-screen').some((entry) => entry.module === name);
}

/** The body of a module's screen, drawn inside the module screen template. Null without a screen. */
export function ModuleScreenSlot({ name }: { name: string }) {
  return <ExtensionSlot kind="module-screen" only={name} />;
}
