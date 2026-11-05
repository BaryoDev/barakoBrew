'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { IconMoon } from '@/components/icons';
import { SidebarMenuButton } from '@/components/ui/sidebar';

const noopSubscribe = () => () => {};

/**
 * The Dark mode row in the rail footer. It flips between light and dark and next-themes keeps the
 * choice in localStorage['bk-brew-theme']. Until someone chooses, the OS setting decides.
 *
 * The state is read from the resolved theme, which the server cannot know, so the row renders as off
 * until the client has mounted and only then reports the real state.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === 'dark';

  return (
    <SidebarMenuButton
      role="switch"
      aria-checked={dark}
      tooltip="Dark mode"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="h-[34px] gap-2.5 rounded-[9px] px-2.5 text-[13.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      <IconMoon aria-hidden className="size-4" />
      <span className="flex-1 truncate">Dark mode</span>
      <span
        aria-hidden
        className={dark ? 'bg-primary relative h-4 w-7 rounded-full' : 'bg-secondary relative h-4 w-7 rounded-full'}
      >
        <span
          className={
            'bg-card absolute top-0.5 size-3 rounded-full shadow-sm transition-[left] duration-200 ' +
            (dark ? 'left-[14px]' : 'left-0.5')
          }
        />
      </span>
    </SidebarMenuButton>
  );
}
