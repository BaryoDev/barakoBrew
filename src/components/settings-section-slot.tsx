'use client';

import { ExtensionSlot } from '@/components/extension-slot';

/**
 * Where module sections sit on the Settings page. Renders what a module registered for
 * `settings-section` and whose module is running, and nothing at all when there is none.
 */
export function SettingsSectionSlot() {
  return (
    <div className="max-w-2xl space-y-4 empty:hidden" data-testid="settings-section-slot">
      <ExtensionSlot kind="settings-section" />
    </div>
  );
}
