import type { ComponentType, SVGProps } from 'react';
import {
  IconAnalytics,
  IconArchive,
  IconBug,
  IconCoins,
  IconContent,
  IconContentTypes,
  IconDashboard,
  IconDisk,
  IconEnvelope,
  IconFilter,
  IconFlag,
  IconSun,
  IconPen,
  IconCube,
  IconGroups,
  IconHealth,
  IconHistory,
  IconKey,
  IconList,
  IconMobile,
  IconRoles,
  IconServer,
  IconSettings,
  IconShield,
  IconTasks,
  IconUsers,
  IconWorkflows,
  IconTable,
  IconWebhook,
} from '@/components/icons';
import { SITE_TYPE } from '@/lib/site-settings';
import { MODULE } from '@/types/modules';

/**
 * Names a live number the rail may show beside an item. It is an identifier, not a value: the
 * component resolves it through `useNavMetrics`, and an unresolved one renders nothing rather than
 * a placeholder. A count nobody can source is left off the item entirely.
 */
export type NavMetric =
  | 'entries'
  | 'contentTypes'
  | 'workflows'
  | 'unresolvedErrors'
  | 'recentBounces';

export interface NavItem {
  title: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** A count rendered right-aligned in mono, or a tinted pill when `tone` says so. */
  metric?: NavMetric;
  /** Pill tint for a metric that reports a problem rather than a size. */
  tone?: 'warning' | 'danger';
  /**
   * Roles the API actually accepts for this destination, copied from the `Roles(...)` call on the
   * endpoint behind it. Omitted means every signed-in user may see it.
   *
   * This is a copy, not a derivation, so it can drift. It is worth having anyway: showing someone
   * nineteen destinations and letting sixteen of them answer 403 is worse than showing three. The
   * backend remains the thing that enforces; this only decides what is worth offering.
   */
  roles?: readonly string[];
  /**
   * The module that serves this destination, by the name it registers with the API. An item that
   * declares one is dropped when `GET /api/modules` says the deployment does not run it.
   *
   * Only for a destination a module serves entirely. Connectors and share links are core, so a
   * deployment always has them and naming a module here would be a guess.
   */
  module?: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/**
 * Filters the nav to what a caller may actually reach. SuperAdmin sees everything, matching the
 * backend, where SensitivityService and the role checks both short-circuit for it.
 *
 * A group whose every item is filtered out is dropped, so the sidebar does not render an empty
 * "Access" heading with nothing under it.
 */
export function visibleGroups(groups: NavGroup[], userRoles: readonly string[] | undefined): NavGroup[] {
  const roles = userRoles ?? [];
  if (roles.includes('SuperAdmin')) return groups;

  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.some((r) => roles.includes(r))) }))
    .filter((g) => g.items.length > 0);
}

/**
 * Drops every item whose module the deployment does not run.
 *
 * `enabled` undefined means the API has not said: still loading, or it refused the list, or the
 * request failed. Then nothing is dropped and the rail is what it has always been. A rail that
 * empties while a request is in flight, or because one call failed, is worse than a rail that lists
 * a screen the deployment turns out not to serve, and those screens still say so on arrival.
 *
 * A module the API lists as not enabled, and a module it does not list at all, are both dropped.
 * The API distinguishes installed-but-off from not-installed; for the person using the console the
 * two are the same screen that is not there.
 */
export function withModules(groups: NavGroup[], enabled: readonly string[] | undefined): NavGroup[] {
  if (!enabled) return groups;
  const running = new Set(enabled);

  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.module || running.has(i.module)) }))
    .filter((g) => g.items.length > 0);
}

/**
 * The first group carries no label on purpose: it is the primary set, the destinations someone works
 * in all day, and a heading over them would only name the app. Every group after it is
 * labelled, and the rail renders those at a smaller size.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { title: 'Overview', href: '/', icon: IconDashboard },
      { title: 'Entries', href: '/content', icon: IconContent, metric: 'entries', roles: ['SuperAdmin', 'Admin'] },
      // Editor was removed when #373 took that grant off GET /api/content-types. Leaving it here
      // rendered a link the API answered 403 to, and nothing creates an Editor role anyway.
      { title: 'Content types', href: '/schemas', icon: IconContentTypes, metric: 'contentTypes', roles: ['SuperAdmin', 'Admin'] },
      // Signed in is enough for GET /api/pages/tree, but moving a page is a content update, which is Admin's.
      { title: 'Pages', href: '/pages', icon: IconList, module: MODULE.pages, roles: ['SuperAdmin', 'Admin'] },
      { title: 'Workflows', href: '/workflows', icon: IconWorkflows, metric: 'workflows', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Queries', href: '/queries', icon: IconFilter, roles: ['SuperAdmin', 'Admin'] },
    ],
  },
  {
    label: 'Site',
    items: [
      // Admin and SuperAdmin, the roles GET /api/content-types answers for, since both screens find
      // the site type through it before they read or write the entry.
      { title: 'Site', href: '/site', icon: IconCube, roles: ['SuperAdmin', 'Admin'] },
      { title: 'Theme', href: '/site/theme', icon: IconSun, roles: ['SuperAdmin', 'Admin'] },
      { title: 'Style recipes', href: '/site/recipes', icon: IconPen, roles: ['SuperAdmin', 'Admin'] },
    ],
  },
  {
    label: 'Access',
    items: [
      { title: 'Tenants', href: '/tenants', icon: IconServer , roles: ['SuperAdmin'] },
      { title: 'Users', href: '/users', icon: IconUsers , roles: ['SuperAdmin'] },
      { title: 'Roles', href: '/roles', icon: IconRoles , roles: ['SuperAdmin'] },
      { title: 'Groups', href: '/user-groups', icon: IconGroups , roles: ['SuperAdmin', 'Admin'] },
      { title: 'API keys', href: '/api-keys', icon: IconKey , roles: ['SuperAdmin', 'Admin'] },
    ],
  },
  {
    label: 'Modules',
    items: [
      { title: 'Accounting', href: '/accounting', icon: IconCoins , module: MODULE.accounting, roles: ['SuperAdmin', 'Admin', 'Accountant'] },
      { title: 'Analytics', href: '/analytics', icon: IconAnalytics , module: MODULE.analytics, roles: ['SuperAdmin', 'Admin'] },
      { title: 'Email events', href: '/email-events', icon: IconEnvelope, metric: 'recentBounces', tone: 'warning', module: MODULE.emailEvents, roles: ['SuperAdmin', 'Admin'] },
      { title: 'Feature flags', href: '/feature-flags', icon: IconFlag , module: MODULE.featureFlags, roles: ['SuperAdmin', 'Admin'] },
      // upload_files, which BarakoCMS.Files seeds to Admin and also lets SuperAdmin through. A custom
      // role granted it is not visible here, since the token carries roles and not capabilities.
      { title: 'Files', href: '/files', icon: IconDisk, module: MODULE.files, roles: ['SuperAdmin', 'Admin'] },
      { title: 'PWA installs', href: '/pwa', icon: IconMobile , module: MODULE.pwa, roles: ['SuperAdmin', 'Admin'] },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Audit log', href: '/audit', icon: IconHistory , roles: ['SuperAdmin', 'Admin'] },
      { title: 'Errors', href: '/errors', icon: IconBug, metric: 'unresolvedErrors', tone: 'danger', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Workflow runs', href: '/workflow-runs', icon: IconTasks, roles: ['SuperAdmin', 'Admin'] },
      { title: 'Health', href: '/ops/health', icon: IconHealth },
      { title: 'Email', href: '/settings/email', icon: IconEnvelope , roles: ['SuperAdmin'] },
      { title: 'Security', href: '/settings/security', icon: IconShield , roles: ['SuperAdmin', 'Admin'] },
      // Every seeded role, because GET /api/devices is scoped to the caller and lists their own
      // devices: an ordinary User has as much right to it as an Admin. Named rather than left
      // ungated, since an item with no roles is offered to a signed-out caller too, and Overview
      // and Health are the only two that should be.
      { title: 'Devices', href: '/settings/devices', icon: IconMobile , module: MODULE.deviceTrust, roles: ['SuperAdmin', 'Admin', 'User'] },
      { title: 'Export and import', href: '/settings/portability', icon: IconArchive , module: MODULE.portability, roles: ['SuperAdmin', 'Admin'] },
      { title: 'Import a spreadsheet', href: '/settings/import', icon: IconTable , module: MODULE.import, roles: ['SuperAdmin', 'Admin'] },
      { title: 'Connectors', href: '/settings/connectors', icon: IconWebhook , roles: ['SuperAdmin', 'Admin'] },
      { title: 'Outbound requests', href: '/settings/requests', icon: IconWebhook , roles: ['SuperAdmin', 'Admin'] },
      { title: 'Settings', href: '/settings', icon: IconSettings , roles: ['SuperAdmin', 'Admin'] },
    ],
  },
];

/**
 * The entries of one content type.
 *
 * One place rather than a template repeated at each call site, because the entries screen reads its
 * filters from the query string and this is the only spelling of `type` it answers to.
 */
export function entriesHref(typeName?: string): string {
  return typeName ? `/content?type=${encodeURIComponent(typeName)}` : '/content';
}

/** Where a single-entry type is edited. The type name is a slug, so encoding is only a guard. */
export function singletonHref(typeName: string): string {
  return `/content/singleton/${encodeURIComponent(typeName)}`;
}

/**
 * Adds a rail item per single-entry type, directly under Entries, with the same roles.
 *
 * Under Entries rather than in a group of their own, because they are entries: a type holding the
 * site's address is edited as often as any list, and a heading over it would name an API flag
 * rather than anything the reader recognises. When Entries was filtered out, nothing is added.
 */
export function withSingletons(
  groups: NavGroup[],
  types: readonly { name: string; displayName: string; isSingleton?: boolean }[] | undefined,
): NavGroup[] {
  // The site type has Site and Theme of its own, so a second rail item for it would be a duplicate.
  const singletons = (types ?? []).filter((t) => t.isSingleton === true && t.name !== SITE_TYPE);
  if (singletons.length === 0) return groups;

  return groups.map((group) => {
    const at = group.items.findIndex((i) => i.href === '/content');
    if (at === -1) return group;

    const entries = group.items[at];
    const added: NavItem[] = singletons.map((t) => ({
      title: t.displayName || t.name,
      href: singletonHref(t.name),
      icon: IconContent,
      roles: entries.roles,
    }));
    return { ...group, items: [...group.items.slice(0, at + 1), ...added, ...group.items.slice(at + 1)] };
  });
}

const SEGMENT_TITLES: Record<string, string> = {
  email: 'Email',
  schemas: 'Content types',
  content: 'Entries',
  pages: 'Pages',
  workflows: 'Workflows',
  'workflow-runs': 'Workflow runs',
  queries: 'Queries',
  users: 'Users',
  roles: 'Roles',
  'user-groups': 'Groups',
  ops: 'System',
  health: 'Health',
  analytics: 'Analytics',
  accounting: 'Accounting',
  errors: 'Errors',
  audit: 'Audit log',
  'email-events': 'Email events',
  'feature-flags': 'Feature flags',
  files: 'Files',
  pwa: 'PWA installs',
  devices: 'Devices',
  portability: 'Export and import',
  connectors: 'Connectors',
  requests: 'Outbound requests',
  settings: 'Settings',
  site: 'Site',
  theme: 'Theme',
  recipes: 'Style recipes',
  new: 'New',
};

export function breadcrumbsFor(
  pathname: string,
  /** What the current screen calls itself, for a last segment that is an id rather than a word. */
  lastTitle?: string
): { title: string; href: string }[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments
    .map((segment, i) => ({
      title: SEGMENT_TITLES[segment] ?? decodeURIComponent(segment),
      href: '/' + segments.slice(0, i + 1).join('/'),
    }))
    // /content/singleton has no page of its own, so it is not offered as a crumb to click.
    .filter((_, i) => !(segments[i] === 'singleton' && segments[i - 1] === 'content'));

  if (lastTitle && crumbs.length > 0) crumbs[crumbs.length - 1].title = lastTitle;
  return crumbs;
}

export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

/**
 * The one item the rail marks active: the longest href that matches.
 *
 * Prefix matching alone marks Entries active on a single-entry type's screen as well as the type's
 * own item, and Settings active on every screen under /settings beside the item for that screen.
 */
export function activeNavHref(hrefs: readonly string[], pathname: string): string | undefined {
  return hrefs
    .filter((href) => isNavItemActive(href, pathname))
    .sort((a, b) => b.length - a.length)[0];
}
