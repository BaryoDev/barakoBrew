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
import { IconChevronDown } from '@/components/icons';
import { ThemeToggle } from '@/components/theme-toggle';
import { AboutDialog } from '@/components/about-dialog';
import { WhatsNew } from '@/components/whats-new';
import { brewVersion } from '@/hooks/use-meta';
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
function metricWords(item: NavItem, metric: { value: number; atLeast?: boolean }) {
  return {
    text: metric.atLeast ? `${metric.value}+` : `${metric.value}`,
    why: item.tone === 'danger' ? ' unresolved' : ' bounced in the last 24 hours',
  };
}

function NavMetricLabel({ item, metrics, dot }: { item: NavItem; metrics: NavMetrics; dot?: boolean }) {
  const metric = item.metric ? metrics[item.metric] : undefined;
  if (!metric) return null;

  // A tinted pill exists to report a problem. Nothing wrong, nothing shown.
  if (item.tone && metric.value === 0) return null;

  const { text, why } = metricWords(item, metric);

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
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{text}</span>
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
                'gap-2.5 rounded-[9px] px-2.5 font-medium transition-colors',
                // 36px and 14px for the main nav, 34px and 13.5px for a module row, the handoff's sizes.
                primary ? 'h-9 text-[14px] [&>svg]:size-[18px]' : 'h-[34px] text-[13.5px] [&>svg]:size-[17px]',
                item.parent && 'ml-5 h-8 w-[calc(100%-1.25rem)] text-[12.5px]',
                'text-muted-foreground hover:text-foreground',
                // Hover and active are the same surface2 tint, as the handoff has them. The active
                // item adds the 600 weight, the ink colour and the accent icon.
                'hover:bg-secondary',
                'data-[active=true]:bg-secondary data-[active=true]:hover:bg-secondary data-[active=true]:text-foreground data-[active=true]:font-semibold',
                // The last module row, in the accent text colour whether or not it is open.
                item.href === '/modules' && 'font-semibold text-(--accent-ink) hover:text-(--accent-ink)',
                active ? '[&>svg]:text-primary' : '[&>svg]:text-muted-foreground',
                item.href === '/modules' && '[&>svg]:text-current'
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
  const version = brewVersion();
  const [aboutOpen, setAboutOpen] = useState(false);

  // Only the destinations that survived filtering get a count fetched for them.
  const visibleHrefs = useMemo(() => hrefsOf(allowed), [allowed]);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [seenHref, setSeenHref] = useState<string | undefined>(undefined);
  const metrics = useNavMetrics(visibleHrefs);

  // Only fetched for a caller the rail already offers Content types to, since the API answers 403
  // to anyone else. The list is the one the schema screens cache, so this is rarely a request.
  const { data: types } = useSchemas(visibleHrefs.has('/schemas'));
  const groups = withSingletons(allowed, types);
  const activeHref = activeNavHref(
    groups.flatMap((g) => g.items.map((i) => i.href)),
    pathname
  );
  // Going to a screen opens the group it is in, even one folded by hand. Adjusted during render
  // rather than in an effect, so the group is open on the first paint of the new screen.
  if (activeHref !== seenHref) {
    setSeenHref(activeHref);
    const holder = groups.find((g) => g.label && g.items.some((i) => i.href === activeHref));
    if (holder?.label && toggled[holder.label] === false) setToggled({ ...toggled, [holder.label]: true });
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-3.5 px-3.5 pt-4 pb-0">
        <div className="flex min-w-0 items-center gap-[9px] px-1.5 py-0.5">
          <Link href="/" className="flex shrink-0 items-center gap-[9px] rounded-[10px] outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50">
            <BrandMark className="size-[26px]" />
            <BrandWordmark className="text-[17px] whitespace-nowrap" />
          </Link>
          {/* This console's version, never the API's: that string is long enough to run into the
              wordmark. The API's version is in the About dialog this opens. */}
          {version && (
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="ml-auto min-w-0 truncate rounded-sm font-mono text-[10.5px] tabular-nums text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {version}
              <span className="sr-only"> (about this instance)</span>
            </button>
          )}
        </div>

        <CommandMenu />
        <TenantSwitcher />
      </SidebarHeader>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col">
      <SidebarContent className="gap-0 px-3.5 pt-3.5 pb-2">
        {groups.map((group, i) => {
          const primary = !group.label;
          const isModules = group.label === 'Modules';
          const label = group.label;
          const holdsActive = group.items.some((item) => item.href === activeHref);
          const open = !group.collapsible || !label || (toggled[label] ?? (group.defaultOpen === true || holdsActive));
          // A folded group still says when something inside it needs a look.
          const flagged = open
            ? []
            : group.items.flatMap((item) => {
                const metric = item.metric ? metrics[item.metric] : undefined;
                if (!item.tone || !metric || metric.value <= 0) return [];
                const { text, why } = metricWords(item, metric);
                return [{ tone: item.tone, label: `${item.title} ${text}${why}` }];
              });
          const attentionTone = flagged.some((f) => f.tone === 'danger') ? 'danger' : 'warning';
          const attentionLabel = flagged.map((f) => f.label).join(', ');
          return (
            <SidebarGroup key={label ?? i} className="p-0 pt-3 first:pt-0">
              {label && group.collapsible ? (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setToggled((t) => ({ ...t, [label]: !open }))}
                  className="flex h-[30px] items-center gap-2 rounded-[9px] px-2.5 text-[12px] font-semibold tracking-[0.04em] text-muted-foreground uppercase outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span className="flex-1 text-left">{label}</span>
                  {flagged.length > 0 && (
                    <span
                      className={cn('pulse size-[7px] rounded-full', attentionTone === 'danger' ? 'bg-destructive' : 'bg-warning')}
                      title={attentionLabel}
                    >
                      <span className="sr-only">Needs attention: {attentionLabel}</span>
                    </span>
                  )}
                  <span className="font-mono text-[11px] font-normal tracking-normal">
                    {group.items.filter((item) => !item.parent && item.href !== '/modules').length}
                  </span>
                  <IconChevronDown
                    className={cn('size-3.5 transition-transform duration-200', !open && '-rotate-90')}
                  />
                </button>
              ) : (
                label && (
                  <SidebarGroupLabel className="h-[30px] px-2.5 text-[12px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
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
      </nav>

      <SidebarFooter className="gap-0 border-t px-3.5 pt-3 pb-4">
        <SidebarMenu className="gap-1.5">
          <SidebarMenuItem className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <ThemeToggle />
            </div>
            {/* Down here rather than in the header row, where it squeezed the wordmark. */}
            <WhatsNew className="size-[34px] shrink-0 max-rail:size-11" />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={logout}
              className="h-[34px] gap-2.5 rounded-[9px] px-2.5 text-[13.5px] text-muted-foreground hover:bg-secondary hover:text-foreground max-rail:h-11"
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
