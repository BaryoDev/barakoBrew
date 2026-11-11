'use client';

import { useMemo } from 'react';
import { useEnabledModules } from '@/hooks/use-modules';
import { registeredSlots, type SlotKind } from '@/lib/extension-slots';

/**
 * The registered components for a slot whose module `GET /api/modules` reports as enabled. While
 * the report is loading, refused or failed there is no answer, so nothing mounts.
 */
export function useSlot<K extends SlotKind>(kind: K) {
  const enabled = useEnabledModules();
  return useMemo(
    () => (enabled ? registeredSlots(kind).filter((entry) => enabled.includes(entry.module)) : []),
    [enabled, kind],
  );
}
