'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckIcon } from 'lucide-react';
import { IconChevronDown } from '@/components/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { useMyTenants, useCurrentTenant, useSwitchTenant } from '@/hooks/use-tenants';

// Matches Tenant.DefaultSlug on the server. The default partition is the platform/home context; the
// cross-tenant token guard always permits a token for it, so switching here never needs a membership.
const DEFAULT_SLUG = 'default';

interface Option {
  slug: string;
  name: string;
  roles?: { id: string; name: string }[];
}

/** Two letters for the badge: the first of each of the first two words, or the first two of one. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

function TenantRow({
  option: o,
  current,
  pending,
  onPick,
}: {
  option: Option;
  current: string | null;
  pending: boolean;
  onPick: (slug: string) => void;
}) {
  const roleNames = o.roles?.map((r) => r.name).join(', ');
  return (
    <button
      type="button"
      onClick={() => onPick(o.slug)}
      disabled={pending}
      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
    >
      <span className="mt-0.5 size-4 shrink-0">
        {o.slug === current && <CheckIcon className="size-4" aria-label="Current tenant" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate">{o.name}</span>
        {o.slug !== DEFAULT_SLUG && (
          <span className="block truncate font-mono text-[11px] text-(--faint)">
            {o.slug}
            {roleNames ? ` · ${roleNames}` : ''}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Tenant picker for multi-tenant deployments, a popover in the rail. Behaviours:
 *  - Auto-scope: if the session token isn't scoped to a tenant the user belongs to (e.g. login lands
 *    on the default partition), switch into their first tenant automatically, so a single-tenant
 *    user lands on their data without any UI.
 *  - Manual switch: a user with any membership can move between their tenants and back to Home (the
 *    default partition). Without the Home entry the default partition is unreachable once you've
 *    switched away.
 * A user with no memberships (a plain single-tenant deployment) renders nothing and never auto-switches.
 */
export function TenantSwitcher() {
  const { data: memberships } = useMyTenants();
  const current = useCurrentTenant();
  const switchTenant = useSwitchTenant();
  const { user } = useAuth();
  const autoSwitched = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Only once per mount. A manual pick below sets the same ref so it never fights the user, which
  // is what lets a deliberate switch to Home stick.
  useEffect(() => {
    if (autoSwitched.current || switchTenant.isPending) return;
    const belongsToCurrent = !!memberships?.some((t) => t.slug === current);
    if (memberships && memberships.length > 0 && !belongsToCurrent) {
      autoSwitched.current = true;
      switchTenant.mutate(memberships[0].slug);
    }
  }, [memberships, current, switchTenant]);

  if (!memberships || memberships.length === 0) return null;

  const home: Option = { slug: DEFAULT_SLUG, name: 'Home' };
  const needle = query.trim().toLowerCase();
  const matches = (o: Option) =>
    !needle || o.name.toLowerCase().includes(needle) || o.slug.toLowerCase().includes(needle);
  const tenants = memberships.filter(matches);
  const showHome = matches(home);
  const label = [home, ...memberships].find((o) => o.slug === current)?.name ?? 'Select tenant';
  const isSuperAdmin = !!user?.roles?.includes('SuperAdmin');
  // The roles the caller holds in the tenant they are in, else the ones on their session.
  const held = memberships.find((t) => t.slug === current)?.roles?.map((r) => r.name);
  const role = (held && held.length > 0 ? held : (user?.roles ?? [])).join(', ');

  const pick = (slug: string) => {
    // A manual pick settles the tenant, so the auto-switch effect cannot bounce a deliberate
    // switch to Home back to the user's first tenant.
    autoSwitched.current = true;
    if (slug !== current) switchTenant.mutate(slug);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Switch tenant"
          disabled={switchTenant.isPending}
          className="border-border bg-card hover-card flex h-[52px] w-full items-center gap-2.5 rounded-xl border px-2.5 text-left shadow-[var(--shadow-card)] outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <span
            aria-hidden
            className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold"
          >
            {initialsOf(label)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] leading-tight font-semibold">{label}</span>
            {role && <span className="text-muted-foreground block truncate text-[11.5px] leading-tight">{role}</span>}
          </span>
          <IconChevronDown aria-hidden className="size-3.5 shrink-0 text-(--faint)" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[330px] p-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a tenant"
          aria-label="Find a tenant"
          className="mb-2 h-8"
        />
        <div className="max-h-64 overflow-y-auto">{tenants.map((o) => (
            <TenantRow key={o.slug} option={o} current={current} pending={switchTenant.isPending} onPick={pick} />
          ))}</div>
        {tenants.length > 0 && showHome && <div role="separator" className="my-1 h-px bg-border" />}
        {showHome && (
          <TenantRow option={home} current={current} pending={switchTenant.isPending} onPick={pick} />
        )}
        {tenants.length === 0 && !showHome && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No tenant matches.</p>
        )}
        <p className="mt-2 px-2 text-xs text-muted-foreground">
          Switching signs you in again to the tenant you pick, with a new token.
        </p>
        {isSuperAdmin && (
          <Link
            href="/tenants"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            Create a tenant
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}
