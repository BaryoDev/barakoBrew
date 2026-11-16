'use client';

import { useState } from 'react';
import { tenantStatusLabel, useTenants, type Tenant } from '@/hooks/use-tenants';
import { useAccess } from '@/hooks/use-access';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconPlus, IconServer } from '@/components/icons';
import { TenantMembers } from '@/components/tenant-members';
import { TenantRail, orDash } from './tenant-rail';

const SIGN_UP_LABELS: Record<string, string> = {
  NotSet: 'Not set',
  Closed: 'Closed',
  InviteOnly: 'Invite only',
  Open: 'Open',
};

function statusTone(t: Tenant) {
  if (t.status === 'Archived') return 'muted' as const;
  return t.isActive ? ('success' as const) : ('warning' as const);
}

export default function TenantsPage() {
  // Listing and creating tenants take manage_tenants. A tenant Admin comes here for the members list.
  const access = useAccess();
  const platformAdmin = access.can('manage_tenants', ['SuperAdmin']);
  const { data: tenants, isLoading, isError, refetch } = useTenants({ enabled: platformAdmin });
  // The open tenant is local state. Other rails here do not carry it in the URL either. Only the
  // handle is kept, so the rail reads the tenant from the current list and shows a refresh.
  const [selectedSlug, setSelectedSlug] = useState<string | 'new' | null>(null);
  const selected: Tenant | 'new' | null =
    selectedSlug === 'new' ? 'new' : ((selectedSlug && tenants?.find((t) => t.slug === selectedSlug)) || null);

  // Save writes what the rail shows, so read the list again as it opens. No version token exists, so
  // this narrows the window for a stale write and does not close it.
  function open(slug: string | 'new') {
    setSelectedSlug(slug);
    void refetch();
  }

  const newButton = (
    <Button size="sm" onClick={() => open('new')}>
      <IconPlus />
      New tenant
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Tenants"
        description="One deployment, many sites. Open a row to edit it in the rail."
        actions={platformAdmin ? newButton : undefined}
      />

      {!platformAdmin ? null : isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState entity="tenants" onRetry={() => refetch()} />
      ) : !tenants?.length ? (
        <EmptyState
          icon={IconServer}
          title="No tenants yet"
          description="Create a tenant to run more than one isolated space on this deployment."
          action={newButton}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary hover:bg-secondary">
                <TableHead>Status</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Site mode</TableHead>
                <TableHead>Sign-up</TableHead>
                <TableHead>Domains</TableHead>
                <TableHead className="text-right">Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id} className="h-11 cursor-pointer" onClick={() => open(t.slug)}>
                  <TableCell className="py-0">
                    <StatusBadge tone={statusTone(t)} dot>
                      {tenantStatusLabel(t)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="py-0">
                    <button
                      type="button"
                      className="grid text-left leading-tight"
                      onClick={(e) => {
                        e.stopPropagation();
                        open(t.slug);
                      }}
                    >
                      <span className="font-medium">{t.name}</span>
                      <span className="text-muted-foreground font-mono text-[11px]">{t.slug}</span>
                    </button>
                  </TableCell>
                  <TableCell className="py-0 text-xs">{orDash(t.siteMode)}</TableCell>
                  <TableCell className="py-0 text-xs">
                    {t.signUp ? (SIGN_UP_LABELS[t.signUp] ?? t.signUp) : orDash(null)}
                  </TableCell>
                  <TableCell className="py-0 font-mono text-xs">
                    {t.domains === undefined ? orDash(null) : t.domains.length ? t.domains.join(', ') : orDash(null)}
                  </TableCell>
                  <TableCell className="py-0 text-right text-xs tabular-nums">{orDash(t.memberCount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TenantMembers />

      <TenantRail target={selected} onClose={() => setSelectedSlug(null)} />
    </>
  );
}
