'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { IconMoon, IconSun } from '@/components/icons';

const noopSubscribe = () => () => {};

/**
 * The theme toggle for the sign-in page, bottom right of the form column.
 *
 * Not the rail's ThemeToggle: that one is a sidebar menu button and needs the sidebar around it.
 * Same storage, same rule: until someone chooses, the OS setting decides, and the real state is
 * only known after mount.
 */
export function ThemeSwitch() {
    const { resolvedTheme, setTheme } = useTheme();
    const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
    const dark = mounted && resolvedTheme === 'dark';
    const Icon = dark ? IconSun : IconMoon;

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            className="text-muted-foreground h-[34px] gap-2 max-[999px]:h-11 text-[12.5px] font-semibold"
        >
            <Icon aria-hidden className="size-3.5" />
            {dark ? 'Light mode' : 'Dark mode'}
        </Button>
    );
}
