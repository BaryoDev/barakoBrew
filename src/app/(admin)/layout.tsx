'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { CrumbTitleProvider } from '@/components/crumb-title';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { BrandMark } from '@/components/brand';
import { UploadsProvider } from '@/components/uploads-provider';
import { UploadTray } from '@/components/upload-tray';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, requireAuth } = useAuth();

  useEffect(() => {
    requireAuth();
  }, [requireAuth]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <BrandMark className="animate-pulse" />
      </div>
    );
  }

  return (
    // 248px of rail, 16px of it padding. The rail sits on the page background and the content panel
    // is inset away from it on three sides, which is what makes the panel read as a card rather
    // than the other half of a split screen.
    <SidebarProvider style={{ '--sidebar-width': '248px' } as React.CSSProperties}>
      <CrumbTitleProvider>
        <UploadsProvider>
          <AppSidebar />
          <SidebarInset className="rail:my-4 rail:mr-4 rail:ml-0 rail:h-[calc(100svh-2rem)] rail:overflow-hidden rail:rounded-xl rail:border rail:bg-card rail:shadow-[var(--shadow-card)]">
            <AppHeader />
            <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6 rail:overflow-auto">{children}</main>
          </SidebarInset>
          {/* Outside the inset, so an upload keeps its row on screen on every route. */}
          <UploadTray />
        </UploadsProvider>
      </CrumbTitleProvider>
    </SidebarProvider>
  );
}
