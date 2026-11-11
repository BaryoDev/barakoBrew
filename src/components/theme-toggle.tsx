'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { SidebarMenuButton } from '@/components/ui/sidebar';

const noopSubscribe = () => () => {};

/**
 * The theme row in the rail footer. Its label names the mode you would switch to, "Dark mode" while
 * the console is light and "Light mode" while it is dark, as the handoff has it. next-themes keeps
 * the choice in localStorage['bk-brew-theme']. Until someone chooses, the OS setting decides.
 *
 * The state is read from the resolved theme, which the server cannot know, so the row reads
 * "Dark mode" until the client has mounted and only then reports the real state.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === 'dark';
  const label = dark ? 'Light mode' : 'Dark mode';

  return (
    <SidebarMenuButton
      tooltip={label}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="h-[34px] gap-2.5 rounded-[9px] px-2.5 text-[13.5px] text-muted-foreground hover:bg-secondary hover:text-foreground max-rail:h-11"
    >
      {/* A 12px ring with its left half filled, the handoff's half-filled circle. */}
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full border-2 border-current bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]"
      />
      <span className="truncate">{label}</span>
    </SidebarMenuButton>
  );
}
