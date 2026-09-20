'use client';

import { Fragment } from 'react';
import { usePathname } from 'next/navigation';
import { breadcrumbsFor } from '@/lib/navigation';
import { useCrumbTitle } from '@/components/crumb-title';
import { TenantSwitcher } from '@/components/tenant-switcher';
import { WhatsNew } from '@/components/whats-new';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export function AppHeader() {
  const pathname = usePathname();
  // A screen whose last segment is an id names its own crumb, so the header reads "Entries / My
  // first post" rather than "Entries / 4f6c2a90-...".
  const named = useCrumbTitle(pathname);
  const crumbs = breadcrumbsFor(pathname, named);

  return (
    <header className="bg-card/85 sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 rounded-t-[inherit] border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 !h-4" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap overflow-hidden">
          <BreadcrumbItem>
            {crumbs.length === 0 ? (
              <BreadcrumbPage>Overview</BreadcrumbPage>
            ) : (
              <BreadcrumbLink href="/">Overview</BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {crumbs.map((crumb, i) => (
            <Fragment key={crumb.href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                {i === crumbs.length - 1 ? (
                  <BreadcrumbPage className="truncate">{crumb.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={crumb.href} className="truncate">
                    {crumb.title}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <TenantSwitcher />
      <WhatsNew />
    </header>
  );
}
