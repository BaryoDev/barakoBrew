import type { Metadata } from "next";
import { Sora, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Signal theme (#407). Sora for display, Manrope for body, JetBrains Mono for anything a machine
// produced. Self-hosted by next/font, so no request leaves the box at runtime, which is the same
// reason the Yeti fonts were loaded this way.
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

declare global {
  interface Window {
    _env_?: {
      NEXT_PUBLIC_API_URL?: string;
    };
  }
}

import QueryProvider from "@/components/query-provider";
import { ContractGate } from "@/components/contract-gate";
import { ThemeProvider } from "@/components/theme-provider";
import ErrorReporter from "@/components/error-reporter";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "BarakoCMS Admin",
  description: "Headless CMS Admin Dashboard",
};

// The app is served under this basePath. env-config.js is a static asset under it, so the script
// src has to carry the prefix, or the config 404s and getApiUrl() falls back to the baked URL.
//
// NEXT_PUBLIC_BASE_PATH, not NEXT_BASE_PATH: next.config.ts inlines this one into the compiled
// output, where entrypoint.sh can rewrite it at start. NEXT_BASE_PATH stayed a runtime lookup that
// only the builder stage ever set, so every server-rendered route asked for /env-config.js at the
// domain root even when the console was served under a prefix.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runtime env must load before hydration so getApiUrl() sees overrides. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src={`${basePath}/env-config.js`} />
      </head>
      <body
        className={`${sora.variable} ${manrope.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {/* Pinned to light. Dark mode was deferred with the Signal redesign (#407), so forcing it here
            is what stops a stored "dark" preference, or an OS setting, from rendering the old Yeti
            palette against Signal components. Drop forcedTheme and restore enableSystem when a dark
            palette is actually drawn. */}
        <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" disableTransitionOnChange>
          <QueryProvider>
            <ErrorReporter />
            {/* Outside the routes, so it covers the sign-in page too: the API reports its contract
                version on every response, 401s included, so the mismatch is known before anybody
                has typed a password. */}
            <ContractGate>{children}</ContractGate>
            <Toaster richColors position="top-right" />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
