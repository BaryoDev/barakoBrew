'use client';

import { Fragment } from 'react';
import { usePathname } from 'next/navigation';
import { breadcrumbsFor } from '@/lib/navigation';
import { useCrumbTitle } from '@/components/crumb-title';
import Link from 'next/link';
import { BrandWordmark } from '@/components/brand';
import { CommandMenu } from '@/components/command-menu';
import { WhatsNew } from '@/components/whats-new';
import { useIsSidebarDrawer } from '@/hooks/use-mobile';
import { useCurrentTenant, useMyTenants } from '@/hooks/use-tenants';
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
  const bar = useIsSidebarDrawer();
  const slug = useCurrentTenant();
  const tenants = useMyTenants();
  const tenant = tenants.data?.find((t) => t.slug === slug)?.name ?? slug;
  const screen = crumbs.length === 0 ? 'Overview' : crumbs[crumbs.length - 1].title;

  // Below 1000px the sidebar is a drawer, so the top bar carries the product: the wordmark, where
  // you are as "{tenant} / {screen}", and the palette, every target 44px.
  if (bar) {
    return (
      <header className="bg-card/85 sticky top-0 z-40 flex shrink-0 items-center gap-2.5 border-b px-4 py-2.5 backdrop-blur">
        <SidebarTrigger />
        <Link href="/" className="rounded-[10px] outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50">
          <BrandWordmark className="text-[17px]" />
        </Link>
        <p aria-label="Where you are" className="text-muted-foreground ml-auto flex min-w-0 items-center gap-1.5 text-[13.5px]">
          {tenant && (
            <>
              <span className="truncate">{tenant}</span>
              <span aria-hidden>/</span>
            </>
          )}
          <b className="text-foreground truncate font-semibold">{screen}</b>
        </p>
        <CommandMenu trigger="bar" />
      </header>
    );
  }

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
      <WhatsNew />
    </header>
  );
}
