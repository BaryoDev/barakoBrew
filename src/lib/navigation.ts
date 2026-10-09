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
   * The capability the API gates this destination's first read on, or several when any one of them
   * opens the screen. When the API reports the caller's capabilities (`GET /api/me`, 4.7 on) this
   * decides and `roles` is not read. An item with `roles` and no capability is one every signed-in
   * caller may use, such as their own devices.
   */
  capability?: string | readonly string[];
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
 * Filters the nav to what a caller may actually reach.
 *
 * With `can`, the caller's capabilities decide, as the API decides: an item is kept when the caller
 * holds its capability (the seeded SuperAdmin role holds all of them). Without it, the older rule by
 * role name: SuperAdmin sees everything, and anyone else the items that list one of their roles.
 *
 * A group whose every item is filtered out is dropped, so the sidebar does not render an empty
 * "Access" heading with nothing under it.
 */
export function visibleGroups(
  groups: NavGroup[],
  userRoles: readonly string[] | undefined,
  can?: (capability: string) => boolean,
): NavGroup[] {
  const roles = userRoles ?? [];
  if (!can && roles.includes('SuperAdmin')) return groups;

  const allowed = (item: NavItem) => {
    if (can) {
      if (item.capability === undefined) return true;
      const needed = typeof item.capability === 'string' ? [item.capability] : item.capability;
      return needed.some((c) => can(c));
    }
    return !item.roles || item.roles.some((r) => roles.includes(r));
  };

  return groups
    .map((g) => ({ ...g, items: g.items.filter(allowed) }))
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
      { title: 'Entries', href: '/content', icon: IconContent, metric: 'entries', capability: 'manage_content_types', roles: ['SuperAdmin', 'Admin'] },
      // Editor was removed when #373 took that grant off GET /api/content-types. Leaving it here
      // rendered a link the API answered 403 to, and nothing creates an Editor role anyway.
      { title: 'Content types', href: '/schemas', icon: IconContentTypes, metric: 'contentTypes', capability: 'manage_content_types', roles: ['SuperAdmin', 'Admin'] },
      // Signed in is enough for GET /api/pages/tree, but the screen lists the types through
      // GET /api/content-types before it can move anything.
      { title: 'Pages', href: '/pages', icon: IconList, module: MODULE.pages, capability: 'manage_content_types', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Workflows', href: '/workflows', icon: IconWorkflows, metric: 'workflows', capability: 'manage_workflows', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Queries', href: '/queries', icon: IconFilter, capability: 'manage_queries', roles: ['SuperAdmin', 'Admin'] },
    ],
  },
  {
    label: 'Site',
    items: [
      // manage_content_types, which GET /api/content-types asks for, since these screens find the
      // site type through it before they read or write the entry.
      { title: 'Site', href: '/site', icon: IconCube, capability: 'manage_content_types', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Theme', href: '/site/theme', icon: IconSun, capability: 'manage_content_types', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Style recipes', href: '/site/recipes', icon: IconPen, capability: 'manage_content_types', roles: ['SuperAdmin', 'Admin'] },
    ],
  },
  {
    label: 'Access',
    items: [
      // Admin for the members list, where a tenant Admin gives roles in their tenant. The tenant list
      // and New tenant stay SuperAdmin only on the screen itself.
      { title: 'Tenants', href: '/tenants', icon: IconServer, capability: ['manage_tenants', 'manage_tenant_members'], roles: ['SuperAdmin', 'Admin'] },
      { title: 'Users', href: '/users', icon: IconUsers, capability: 'manage_users', roles: ['SuperAdmin'] },
      { title: 'Roles', href: '/roles', icon: IconRoles, capability: 'manage_roles', roles: ['SuperAdmin'] },
      { title: 'Groups', href: '/user-groups', icon: IconGroups, capability: 'manage_user_groups', roles: ['SuperAdmin', 'Admin'] },
      { title: 'API keys', href: '/api-keys', icon: IconKey, capability: 'manage_api_keys', roles: ['SuperAdmin', 'Admin'] },
    ],
  },
  {
    label: 'Modules',
    items: [
      { title: 'Accounting', href: '/accounting', icon: IconCoins , module: MODULE.accounting, capability: 'view_ledger', roles: ['SuperAdmin', 'Admin', 'Accountant'] },
      { title: 'Analytics', href: '/analytics', icon: IconAnalytics , module: MODULE.analytics, capability: 'view_analytics', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Email events', href: '/email-events', icon: IconEnvelope, metric: 'recentBounces', tone: 'warning', module: MODULE.emailEvents, capability: 'view_email_events', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Feature flags', href: '/feature-flags', icon: IconFlag , module: MODULE.featureFlags, capability: 'manage_feature_flags', roles: ['SuperAdmin', 'Admin'] },
      // upload_files, which BarakoCMS.Files seeds to Admin. The roles are the fallback for an API
      // that does not report capabilities, where a custom role granted it is not offered Files.
      { title: 'Files', href: '/files', icon: IconDisk, module: MODULE.files, capability: 'upload_files', roles: ['SuperAdmin', 'Admin'] },
      { title: 'PWA installs', href: '/pwa', icon: IconMobile , module: MODULE.pwa, capability: 'view_pwa_installs', roles: ['SuperAdmin', 'Admin'] },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Audit log', href: '/audit', icon: IconHistory, capability: 'view_audit_log', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Errors', href: '/errors', icon: IconBug, metric: 'unresolvedErrors', tone: 'danger', capability: 'manage_client_errors', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Workflow runs', href: '/workflow-runs', icon: IconTasks, capability: 'view_workflow_runs', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Health', href: '/ops/health', icon: IconHealth },
      // Reading takes manage_settings; saving and the test send take manage_email_settings, which the
      // screen checks for its buttons.
      { title: 'Email', href: '/settings/email', icon: IconEnvelope, capability: 'manage_settings', roles: ['SuperAdmin'] },
      // The caller's own second factor. With capabilities known it is offered to every signed-in
      // caller, as the API serves it; the roles are what an older API's console offered.
      { title: 'Security', href: '/settings/security', icon: IconShield , roles: ['SuperAdmin', 'Admin'] },
      // Every seeded role, because GET /api/devices is scoped to the caller and lists their own
      // devices: an ordinary User has as much right to it as an Admin. Named rather than left
      // ungated, since an item with no roles is offered to a signed-out caller too, and Overview
      // and Health are the only two that should be.
      { title: 'Devices', href: '/settings/devices', icon: IconMobile , module: MODULE.deviceTrust, roles: ['SuperAdmin', 'Admin', 'User'] },
      { title: 'Export and import', href: '/settings/portability', icon: IconArchive , module: MODULE.portability, capability: 'export_content', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Import a spreadsheet', href: '/settings/import', icon: IconTable , module: MODULE.import, capability: 'analyze_spreadsheets', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Connectors', href: '/settings/connectors', icon: IconWebhook, capability: 'view_connectors', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Outbound requests', href: '/settings/requests', icon: IconWebhook, capability: 'manage_requests', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Deliveries', href: '/settings/deliveries', icon: IconTasks, capability: 'view_workflow_runs', roles: ['SuperAdmin', 'Admin'] },
      // manage_forms, which BarakoCMS.Forms seeds to Admin; SuperAdmin passes every gate.
      { title: 'Forms', href: '/settings/forms', icon: IconList, module: MODULE.forms, capability: 'manage_forms', roles: ['SuperAdmin', 'Admin'] },
      { title: 'Settings', href: '/settings', icon: IconSettings, capability: 'manage_settings', roles: ['SuperAdmin', 'Admin'] },
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
      capability: entries.capability,
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
  deliveries: 'Deliveries',
  forms: 'Forms',
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
