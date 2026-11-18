'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { NAV_GROUPS } from '@/lib/navigation';
import { contentTitle } from '@/lib/content-title';
import { IconContent, IconMoon, IconPlus, IconSun } from '@/components/icons';
import { useContents } from '@/hooks/use-contents';
import { useDebounced } from '@/hooks/use-debounced';
import { Button } from '@/components/ui/button';
import { useIsSidebarDrawer } from '@/hooks/use-mobile';
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

/** The canvas shows at most nine rows once a query is typed. */
export const PALETTE_CAP = 9;
const ENTRY_DEBOUNCE_MS = 250;

const matches = (label: string, q: string) => !q || label.toLowerCase().includes(q.toLowerCase());

/**
 * The palette. `trigger="rail"` is the full-width field in the sidebar; `trigger="bar"` is the 44px
 * button in the top bar below 1000px, where the sidebar is a drawer that is not mounted until it is
 * opened. Exactly one of them owns the ⌘K shortcut: the bar's below the breakpoint, the rail's above
 * it. That is what keeps one keystroke from opening two palettes.
 */
export function CommandMenu({ trigger = 'rail' }: { trigger?: 'rail' | 'bar' }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const drawer = useIsSidebarDrawer();
  const ownsShortcut = trigger === 'bar' ? true : !drawer;
  const [query, setQuery] = useState('');
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const q = query.trim();
  // Entries come from the same list call as the Entries screen, which is tenant-keyed. Nothing is
  // sent until the palette is open and something is typed, so an empty palette costs no request.
  const settled = useDebounced(q, ENTRY_DEBOUNCE_MS);
  const entries = useContents(
    { search: settled, page: 1, pageSize: PALETTE_CAP },
    open && settled.length > 0
  );

  useEffect(() => {
    if (!ownsShortcut) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [ownsShortcut]);

  const run = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  }, []);

  // cmdk's own filter is off: it would hide an entry the server matched on a field other than the
  // title, and it cannot hold the canvas's nine row cap. Order is the canvas's: screens, entries,
  // create actions, then the theme action. A typed query is capped at nine rows in that order.
  const screens = NAV_GROUPS.flatMap((g) => g.items).filter((item) => matches(item.title, q));
  const entryRows = settled === q && q ? (entries.data?.items ?? []) : [];
  const create = [
    { label: 'New content type', href: '/schemas/new' },
    { label: 'New entry', href: '/content/new' },
    { label: 'New workflow', href: '/workflows/new' },
  ].filter((c) => matches(c.label, q));
  const themeLabel = 'Toggle dark mode';
  const showTheme = matches(themeLabel, q);

  const limit = q ? PALETTE_CAP : Infinity;
  const shownScreens = screens.slice(0, limit);
  const shownEntries = entryRows.slice(0, Math.max(0, limit - shownScreens.length));
  const shownCreate = create.slice(0, Math.max(0, limit - shownScreens.length - shownEntries.length));
  const shownTheme =
    showTheme && shownScreens.length + shownEntries.length + shownCreate.length < limit;
  const nothing = !shownScreens.length && !shownEntries.length && !shownCreate.length && !shownTheme;

  return (
    <>
      {/* Lives in the sidebar rail, so it is sized to the rail: full width, 40px, a white field on
          the page background rather than a compact header control. */}
      {trigger === 'bar' ? (
        <button
          type="button"
          aria-label="Search ⌘K"
          onClick={() => setOpen(true)}
          className="border-border bg-card text-muted-foreground hover:text-foreground size-11 shrink-0 rounded-[11px] border font-mono text-[11px] outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span aria-hidden>⌘K</span>
        </button>
      ) : (
        <Button
          variant="outline"
          className="bg-background hover:bg-background h-[38px] w-full justify-start gap-2.5 rounded-[10px] px-3 font-normal text-muted-foreground shadow-none hover:border-primary hover:text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <span className="flex-1 text-left text-[13.5px]">Search or jump to</span>
          <kbd className="bg-secondary pointer-events-none rounded-[5px] px-1.5 py-0.5 font-mono text-[10.5px]">
            ⌘K
          </kbd>
        </Button>
      )}
      <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
        <CommandInput
          placeholder="Jump to a screen or entry"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {nothing && !(q && entries.isFetching) && (
            <div className="text-muted-foreground py-6 text-center text-sm">Nothing matches that search.</div>
          )}
          {shownScreens.length > 0 && (
            <CommandGroup heading="Go to">
              {shownScreens.map((item) => (
                <CommandItem key={item.href} value={`go ${item.href}`} onSelect={() => run(() => router.push(item.href))}>
                  <item.icon />
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {shownEntries.length > 0 && (
            <CommandGroup heading="Entries">
              {shownEntries.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={`entry ${entry.id}`}
                  onSelect={() => run(() => router.push(`/content/${entry.id}`))}
                >
                  <IconContent />
                  <span className="flex-1 truncate">{contentTitle(entry.data, entry.id)}</span>
                  <span className="text-muted-foreground text-xs">{entry.contentType}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {shownCreate.length > 0 && (
            <>
              {(shownScreens.length > 0 || shownEntries.length > 0) && <CommandSeparator />}
              <CommandGroup heading="Create">
                {shownCreate.map((c) => (
                  <CommandItem key={c.href} value={`create ${c.href}`} onSelect={() => run(() => router.push(c.href))}>
                    <IconPlus />
                    {c.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {shownTheme && (
            <CommandGroup heading="Action">
              <CommandItem value="action theme" onSelect={() => run(() => setTheme(dark ? 'light' : 'dark'))}>
                {dark ? <IconSun /> : <IconMoon />}
                {themeLabel}
                <span className="text-muted-foreground ml-auto text-xs">{dark ? 'Light' : 'Dark'}</span>
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
