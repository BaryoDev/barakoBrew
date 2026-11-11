'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckIcon } from 'lucide-react';
import { IconChevronDown } from '@/components/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
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

/** Highest first. A role not named here ranks below these, in the order the API listed it. */
const ROLE_RANK = ['SuperAdmin', 'Admin'];

/**
 * The one role to show for a membership. A person with several is shown their highest, since the
 * rest add nothing the highest does not already say.
 */
export function highestRole(roles: readonly { name: string }[] | undefined): string {
  if (!roles || roles.length === 0) return '';
  const rank = (name: string) => {
    const at = ROLE_RANK.indexOf(name);
    return at === -1 ? ROLE_RANK.length : at;
  };
  return roles.reduce((best, r) => (rank(r.name) < rank(best.name) ? r : best)).name;
}

/** Two letters for the badge: the first of each of the first two words, or the first two of one. */
export function initialsOf(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return '?';
  const chars = (w: string) => Array.from(w);
  const letters = words.length > 1 ? chars(words[0])[0] + chars(words[1])[0] : chars(words[0]).slice(0, 2).join('');
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
  const roleNames = highestRole(o.roles);
  return (
    <button
      type="button"
      onClick={() => onPick(o.slug)}
      disabled={pending}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left outline-hidden hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 max-rail:min-h-11',
        o.slug === current && 'bg-accent'
      )}
    >
      <span
        aria-hidden
        className="bg-secondary grid size-[26px] shrink-0 place-items-center rounded-[7px] font-mono text-[10.5px]"
      >
        {initialsOf(o.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] leading-tight font-semibold">{o.name}</span>
        {o.slug !== DEFAULT_SLUG && (
          <span className="text-muted-foreground block truncate font-mono text-[11.5px] leading-tight">
            {o.slug}
            {roleNames ? ` · ${roleNames}` : ''}
          </span>
        )}
      </span>
      <span className="text-primary size-4 shrink-0">
        {o.slug === current && <CheckIcon className="size-4" aria-label="Current tenant" />}
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
  // Only what the membership says. The session's roles are for wherever the token was issued, so
  // showing them against another tenant could name a role the caller does not hold there.
  const role = highestRole(memberships.find((t) => t.slug === current)?.roles);

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
          className="border-border bg-card hover:border-primary flex w-full items-center gap-2.5 rounded-[11px] border px-2.5 py-[9px] text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <span
            aria-hidden
            className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-lg font-mono text-[11px]"
          >
            {initialsOf(label)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] leading-tight font-semibold">{label}</span>
            {role && <span className="text-muted-foreground block truncate text-[11.5px] leading-tight">{role}</span>}
          </span>
          <IconChevronDown aria-hidden className="size-3.5 shrink-0 text-(--faint)" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[276px] rounded-[14px] p-1.5 shadow-(--shadow)">
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
        <p className="mt-1 px-2.5 pt-2 pb-1 text-[11.5px] leading-normal text-muted-foreground">
          Switching re-issues your token. Your role can differ per tenant.
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
