'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { NAV_GROUPS } from '@/lib/navigation';
import { IconPlus } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useIsSidebarDrawer } from '@/hooks/use-mobile';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

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
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Go to a page or run an action…" />
        <CommandList>
          <CommandEmpty>Nothing matches that search.</CommandEmpty>
          <CommandGroup heading="Go to">
            {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
              <CommandItem key={item.href} onSelect={() => run(() => router.push(item.href))}>
                <item.icon />
                {item.title}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Create">
            <CommandItem onSelect={() => run(() => router.push('/schemas/new'))}>
              <IconPlus />
              New content type
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push('/content/new'))}>
              <IconPlus />
              New entry
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push('/workflows/new'))}>
              <IconPlus />
              New workflow
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
