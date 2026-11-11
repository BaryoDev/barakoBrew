'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IconContent } from '@/components/icons';

export const ALL_TYPES = 'all';

export interface EntryTypeTab {
  name: string;
  displayName: string;
}

/**
 * The content type tabs above the Entries table, an "All" tab first.
 *
 * A tablist rather than a select, so the types are visible and one keypress apart. The schema list
 * carries no icon, so every type gets the same content glyph until it does.
 *
 * Only the list is rendered here. The caller owns the Tabs root, so it holds the selected value,
 * and wraps the table in a TabsContent with the same value so aria-controls points at something real.
 */
export function EntryTypeTabs({ types }: { types: EntryTypeTab[] }) {
  return (
    <TabsList
      aria-label="Content type"
      className="h-[38px] max-w-full justify-start overflow-x-auto"
    >
      <TabsTrigger value={ALL_TYPES} className="flex-none px-3">
        All
      </TabsTrigger>
      {types.map((type) => (
        <TabsTrigger key={type.name} value={type.name} className="flex-none px-3">
          <IconContent aria-hidden />
          {type.displayName}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

export { Tabs };
