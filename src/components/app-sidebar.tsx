'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useAllowedGroups, hrefsOf } from '@/hooks/use-visible-hrefs';
import { BrandMark, BrandWordmark } from '@/components/brand';
import {
  activeNavHref,
  withSingletons,
  type NavGroup,
  type NavItem,
} from '@/lib/navigation';
import { useSchemas } from '@/hooks/use-schemas';
import { useNavMetrics, type NavMetrics } from '@/hooks/use-nav-metrics';
import { CommandMenu } from '@/components/command-menu';
import { TenantSwitcher } from '@/components/tenant-switcher';
import { IconChevronDown } from '@/components/icons';
import { AboutDialog } from '@/components/about-dialog';
import { useApiMeta } from '@/hooks/use-meta';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

/**
 * The number beside a nav item. Three shapes, all of them real:
 *  - a plain mono count on the primary items, right-aligned, saying how big the thing is;
 *  - a tinted pill when the item declares a tone, saying something needs attention;
 *  - nothing at all when the metric has no source, which is the default.
 *
 * The screen-reader text is not decoration. "Errors 2" on its own does not say two of what.
 */
function NavMetricLabel({ item, metrics, dot }: { item: NavItem; metrics: NavMetrics; dot?: boolean }) {
  const metric = item.metric ? metrics[item.metric] : undefined;
  if (!metric) return null;

  // A tinted pill exists to report a problem. Nothing wrong, nothing shown.
  if (item.tone && metric.value === 0) return null;

  const text = metric.atLeast ? `${metric.value}+` : `${metric.value}`;
  const why = item.tone === 'danger' ? ' unresolved' : ' bounced in the last 24 hours';

  if (dot && item.tone) {
    return (
      <span
        className={cn('size-[7px] rounded-full', item.tone === 'danger' ? 'bg-destructive' : 'bg-warning')}
        title={`${text}${why}`}
      >
        <span className="sr-only">{` ${text}${why}`}</span>
      </span>
    );
  }

  if (!item.tone) {
    return (
      <span className="font-mono text-[11px] tabular-nums text-(--faint)">{text}</span>
    );
  }

  return (
    <span
      className={cn(
        'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[10.5px] font-medium tabular-nums',
        item.tone === 'danger'
          ? 'bg-(--danger-soft) text-destructive'
          : 'bg-(--warning-soft) text-warning'
      )}
    >
      {text}
      <span className="sr-only">{why}</span>
    </span>
  );
}

function NavList({
  group,
  primary,
  activeHref,
  metrics,
  dots,
}: {
  dots?: boolean;
  group: NavGroup;
  primary: boolean;
  activeHref: string | undefined;
  metrics: NavMetrics;
}) {
  return (
    <SidebarMenu className="gap-0.5">
      {group.items.map((item) => {
        const active = item.href === activeHref;
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              closesDrawer
              isActive={active}
              tooltip={item.title}
              className={cn(
                'gap-2.5 rounded-[10px] px-2.5 font-medium transition-colors',
                primary ? 'h-9 text-[13.5px] [&>svg]:size-[18px]' : 'h-[34px] text-[13px] [&>svg]:size-[17px]',
                'text-secondary-foreground hover:text-foreground',
                // Hover is half the sunken tint. The active item takes all of it, a hairline and the
                // accent icon, as in the round 2 handoff, so the two never look alike.
                'hover:bg-secondary/50',
                'data-[active=true]:bg-secondary data-[active=true]:hover:bg-secondary data-[active=true]:text-foreground data-[active=true]:font-semibold data-[active=true]:shadow-[inset_0_0_0_1px_var(--border)]',
                active ? '[&>svg]:text-primary' : '[&>svg]:text-(--faint)'
              )}
            >
              <Link href={item.href}>
                <item.icon />
                <span className="flex-1 truncate">{item.title}</span>
                <NavMetricLabel item={item} metrics={metrics} dot={dots && !!item.tone} />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Filtered by role or capability and by the modules the deployment runs, see useAllowedGroups.
  const allowed = useAllowedGroups();
  const { data: meta } = useApiMeta();
  const [aboutOpen, setAboutOpen] = useState(false);

  // Only the destinations that survived filtering get a count fetched for them.
  const visibleHrefs = useMemo(() => hrefsOf(allowed), [allowed]);
  const [modulesOpen, setModulesOpen] = useState(true);
  const metrics = useNavMetrics(visibleHrefs);

  // Only fetched for a caller the rail already offers Content types to, since the API answers 403
  // to anyone else. The list is the one the schema screens cache, so this is rarely a request.
  const { data: types } = useSchemas(visibleHrefs.has('/schemas'));
  const groups = withSingletons(allowed, types);
  const activeHref = activeNavHref(
    groups.flatMap((g) => g.items.map((i) => i.href)),
    pathname
  );

  return (
    <Sidebar collapsible="offcanvas" className="border-none">
      <SidebarHeader className="gap-3 p-4 pb-2">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-[10px] outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50">
            <BrandMark className="size-[30px]" />
            <BrandWordmark />
          </Link>
          {/* Hidden until the API has answered: a version line reading "unknown" is worse than none. */}
          {meta?.version && (
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="ml-auto rounded-sm font-mono text-[11px] tabular-nums text-(--faint) outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {meta.version}
              <span className="sr-only"> (about this instance)</span>
            </button>
          )}
        </div>

        <TenantSwitcher />
        <CommandMenu />
      </SidebarHeader>

      <SidebarContent className="px-4 pb-2">
        {groups.map((group, i) => {
          const primary = !group.label;
          const isModules = group.label === 'Modules';
          const open = !isModules || modulesOpen;
          return (
            <SidebarGroup key={group.label ?? i} className="p-0 pt-3 first:pt-1">
              {group.label && isModules ? (
                <button
                  type="button"
                  aria-expanded={modulesOpen}
                  onClick={() => setModulesOpen((v) => !v)}
                  className="flex h-6 items-center gap-2 rounded-[9px] px-2.5 text-[10.5px] font-extrabold tracking-[0.12em] text-(--faint) uppercase outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span className="flex-1 text-left">{group.label}</span>
                  <span className="font-mono text-[11px] font-normal tracking-normal">{group.items.length}</span>
                  <IconChevronDown
                    className={cn('size-3.5 transition-transform duration-200', !modulesOpen && '-rotate-90')}
                  />
                </button>
              ) : (
                group.label && (
                  <SidebarGroupLabel className="h-6 px-2.5 text-[10.5px] font-extrabold tracking-[0.12em] text-(--faint) uppercase">
                    {group.label}
                  </SidebarGroupLabel>
                )
              )}
              {open && (
                <SidebarGroupContent>
                  <NavList group={group} primary={primary} activeHref={activeHref} metrics={metrics} dots={isModules} />
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-4 pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={logout}
              className="h-[34px] gap-2.5 rounded-[9px] px-2.5 text-[13.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <span aria-hidden className="size-3 shrink-0 rounded-full border-2 border-primary bg-accent" />
              <span className="truncate">
                {user?.username ?? 'Account'} · Sign out
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </Sidebar>
  );
}
