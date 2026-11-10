'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/** Where the choice is kept. The round 3 handoff names this key. */
export const THEME_STORAGE_KEY = 'bk-brew-theme';

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
