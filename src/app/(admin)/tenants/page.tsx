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
  // The open tenant is local state. Other rails here do not carry it in the URL either.
  const [selected, setSelected] = useState<Tenant | 'new' | null>(null);

  const newButton = (
    <Button size="sm" onClick={() => setSelected('new')}>
      <IconPlus />
      New tenant
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Isolated spaces on this deployment, each with its own content, users and data."
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
                <TableRow key={t.id} className="h-11 cursor-pointer" onClick={() => setSelected(t)}>
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
                        setSelected(t);
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

      <TenantRail target={selected} onClose={() => setSelected(null)} />
    </>
  );
}
