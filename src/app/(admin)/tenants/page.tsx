'use client';

import { useState } from 'react';
import { tenantStatusLabel, useTenants, type Tenant } from '@/hooks/use-tenants';
import { useAccess } from '@/hooks/use-access';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IconPlus, IconServer } from '@/components/icons';
import { TenantMembers } from '@/components/tenant-members';
import { TenantRail } from '@/components/tenants/tenant-rail';

export default function TenantsPage() {
  // Listing and creating tenants take manage_tenants. A tenant Admin comes here for the members list.
  const access = useAccess();
  const platformAdmin = access.can('manage_tenants', ['SuperAdmin']);
  const { data: tenants, isLoading, isError, refetch } = useTenants({ enabled: platformAdmin });
  const [railTenant, setRailTenant] = useState<Tenant | 'new' | null>(null);

  const newButton = (
    <Button size="sm" onClick={() => setRailTenant('new')}>
      <IconPlus />
      New tenant
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Isolated spaces on this deployment — each with its own content, users and data."
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
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Domains</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id} className="h-11 cursor-pointer" onClick={() => setRailTenant(t)}>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRailTenant(t);
                      }}
                    >
                      {t.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{t.slug}</TableCell>
                  <TableCell>
                    <Badge variant={t.isActive ? 'default' : 'secondary'}>{tenantStatusLabel(t)}</Badge>
                  </TableCell>
                  <TableCell>
                    {t.domains === undefined ? (
                      <span className="text-muted-foreground text-xs">Not reported by this API</span>
                    ) : (
                      <span className="font-mono text-xs">{t.domains.length ? t.domains.join(', ') : 'None'}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TenantMembers />

      <TenantRail tenant={railTenant} onClose={() => setRailTenant(null)} />
    </>
  );
}
