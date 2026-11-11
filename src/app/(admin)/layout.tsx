'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { CrumbTitleProvider } from '@/components/crumb-title';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { BrandMark } from '@/components/brand';
import { UploadsProvider } from '@/components/uploads-provider';
import { UploadTray } from '@/components/upload-tray';
import { RememberInstance } from '@/components/sign-in/remember-instance';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, requireAuth } = useAuth();
  const pathname = usePathname();

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
    // The design's grid: a 236px sidebar on the surface colour with a hairline on its right edge,
    // and the content straight on the page beside it. Screens set their own page title; main only
    // sets the padding, 32px above, clamp(20px, 3vw, 40px) at the sides, 64px below, and the
    // 1240px cap.
    <SidebarProvider style={{ '--sidebar-width': '236px' } as React.CSSProperties}>
      <CrumbTitleProvider>
        <UploadsProvider>
          <RememberInstance />
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <AppHeader />
            <main key={pathname} className="rise w-full max-w-[1240px] flex-1 px-[clamp(20px,3vw,40px)] pt-8 pb-16">{children}</main>
          </SidebarInset>
          {/* Outside the inset, so an upload keeps its row on screen on every route. */}
          <UploadTray />
        </UploadsProvider>
      </CrumbTitleProvider>
    </SidebarProvider>
  );
}
