'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useAllowedGroups, hrefsOf } from '@/hooks/use-visible-hrefs';
import { BrandMark, BrandWordmark } from '@/components/brand';
import {
  activeNavHref,
  isNavItemActive,
  withSingletons,
  type NavGroup,
  type NavItem,
} from '@/lib/navigation';
import { useSchemas } from '@/hooks/use-schemas';
import { useNavMetrics, type NavMetrics } from '@/hooks/use-nav-metrics';
import { CommandMenu } from '@/components/command-menu';
import { TenantSwitcher } from '@/components/tenant-switcher';
import { IconChevronDown, IconMoon } from '@/components/icons';
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
        className={cn('size-[7px] rounded-full pulse', item.tone === 'danger' ? 'bg-destructive' : 'bg-warning')}
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
  pathname,
}: {
  dots?: boolean;
  pathname: string;
  group: NavGroup;
  primary: boolean;
  activeHref: string | undefined;
  metrics: NavMetrics;
}) {
  return (
    <SidebarMenu className="gap-0.5">
      {group.items
        // A child of an item is only listed while that item, or one of its children, is open.
        .filter((item) => !item.parent || isNavItemActive(item.parent, pathname))
        .map((item) => {
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
                item.parent && 'ml-5 h-8 w-[calc(100%-1.25rem)] text-[12.5px]',
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
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
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
          const label = group.label;
          const holdsActive = group.items.some((item) => item.href === activeHref);
          const open = !group.collapsible || !label || (toggled[label] ?? (group.defaultOpen === true || holdsActive));
          // A folded group still says when something inside it needs a look.
          const attention =
            !open &&
            group.items.some((item) => item.tone && item.metric && (metrics[item.metric]?.value ?? 0) > 0);
          return (
            <SidebarGroup key={label ?? i} className="p-0 pt-3 first:pt-1">
              {label && group.collapsible ? (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setToggled((t) => ({ ...t, [label]: !open }))}
                  className="flex h-6 items-center gap-2 rounded-[9px] px-2.5 text-[10.5px] font-extrabold tracking-[0.12em] text-(--faint) uppercase outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span className="flex-1 text-left">{label}</span>
                  {attention && (
                    <span className="bg-warning pulse size-[7px] rounded-full">
                      <span className="sr-only">Needs attention</span>
                    </span>
                  )}
                  <span className="font-mono text-[11px] font-normal tracking-normal">
                    {group.items.filter((item) => !item.parent).length}
                  </span>
                  <IconChevronDown
                    className={cn('size-3.5 transition-transform duration-200', !open && '-rotate-90')}
                  />
                </button>
              ) : (
                label && (
                  <SidebarGroupLabel className="h-6 px-2.5 text-[10.5px] font-extrabold tracking-[0.12em] text-(--faint) uppercase">
                    {label}
                  </SidebarGroupLabel>
                )
              )}
              {open && (
                <SidebarGroupContent>
                  <NavList
                    group={group}
                    primary={primary}
                    activeHref={activeHref}
                    metrics={metrics}
                    dots={isModules}
                    pathname={pathname}
                  />
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-4 pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            {/* The palette is not drawn yet (#407), and layout.tsx pins the theme to light, so the
                switch is shown, off, and cannot be turned on. */}
            <SidebarMenuButton
              role="switch"
              aria-checked={false}
              aria-disabled
              title="Dark mode is not available yet"
              tooltip="Dark mode"
              className="h-[34px] cursor-not-allowed gap-2.5 rounded-[9px] px-2.5 text-[13.5px] text-muted-foreground opacity-70 hover:bg-transparent hover:text-muted-foreground"
            >
              <IconMoon aria-hidden className="size-4" />
              <span className="flex-1 truncate">Dark mode</span>
              <span aria-hidden className="bg-secondary relative h-4 w-7 rounded-full">
                <span className="bg-card absolute top-0.5 left-0.5 size-3 rounded-full shadow-sm" />
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
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
