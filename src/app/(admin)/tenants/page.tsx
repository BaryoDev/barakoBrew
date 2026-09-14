'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  domainClash,
  domainProblems,
  useCreateTenant,
  useTenants,
  useUpdateTenantDomains,
  type Tenant,
} from '@/hooks/use-tenants';
import { apiErrorMessage } from '@/lib/api';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

// Handle rules mirror the server (TenantHandles): 3-40 chars, lowercase alphanumerics + hyphens,
// no leading/trailing hyphen. Validated inline so the user sees the rule before submitting.
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

function CreateTenantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateTenant();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleEdited, setHandleEdited] = useState(false);
  const [about, setAbout] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Derive the handle from the name until the user edits it directly (same nicety as the schema form).
  const derivedHandle = handleEdited
    ? handle
    : name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);

  const handleValid = HANDLE_RE.test(derivedHandle);
  const canSave = name.trim().length > 0 && handleValid && !create.isPending;

  function reset() {
    setName('');
    setHandle('');
    setHandleEdited(false);
    setAbout('');
    setIsActive(true);
    create.reset();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    try {
      await create.mutateAsync({
        Handle: derivedHandle,
        Name: name.trim(),
        About: about.trim() || undefined,
        IsActive: isActive,
      });
      toast.success(`Tenant "${name.trim()}" created`, {
        description: 'You were added as an admin member, so you can switch to it right away.',
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not create the tenant.'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New tenant</DialogTitle>
            <DialogDescription>
              A tenant is an isolated space with its own content, users and data. You&apos;ll be added
              as its first admin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="tenant-name">Name</Label>
              <Input
                id="tenant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corporation"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- focus belongs in a dialog the moment it opens, which is what WAI-ARIA authoring practices ask for. The rule is aimed at autofocus on page load.
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tenant-handle">Handle</Label>
              <Input
                id="tenant-handle"
                value={derivedHandle}
                onChange={(e) => {
                  setHandleEdited(true);
                  setHandle(e.target.value.toLowerCase());
                }}
                placeholder="acme"
                aria-invalid={derivedHandle.length > 0 && !handleValid}
              />
              <p className="text-muted-foreground text-xs">
                {derivedHandle.length > 0 && !handleValid
                  ? '3–40 characters, lowercase letters, numbers and hyphens; no leading or trailing hyphen.'
                  : 'Used in URLs and the X-Tenant header. Cannot be changed later.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tenant-about">About (optional)</Label>
              <Input
                id="tenant-about"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="Short description"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="tenant-active">Active</Label>
                <p className="text-muted-foreground text-xs">Inactive tenants can&apos;t issue tokens.</p>
              </div>
              <Switch id="tenant-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {create.isPending ? 'Creating…' : 'Create tenant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DomainsDialog({ tenant, onOpenChange }: { tenant: Tenant | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={tenant !== null} onOpenChange={onOpenChange}>
      <DialogContent>{tenant && <DomainsForm key={tenant.slug} tenant={tenant} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function DomainsForm({ tenant, onDone }: { tenant: Tenant; onDone: () => void }) {
  const update = useUpdateTenantDomains();
  const [text, setText] = useState((tenant.domains ?? []).join('\n'));
  const [clash, setClash] = useState<string | null>(null);

  const domains = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const problems = domainProblems(domains);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (problems.length > 0) return;
    setClash(null);
    try {
      await update.mutateAsync({ tenant, domains });
      toast.success(domains.length ? `Domains saved for ${tenant.name}` : `Domains cleared for ${tenant.name}`);
      onDone();
    } catch (err) {
      const message = domainClash(err);
      if (message) setClash(message);
      else toast.error(apiErrorMessage(err, 'The domains could not be saved.'));
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Domains for {tenant.name}</DialogTitle>
        <DialogDescription>
          The hosts this tenant answers on, one per line, such as example.com. A domain belongs to one tenant.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2 py-4">
        <Label htmlFor="tenant-domains">Domains</Label>
        <Textarea
          id="tenant-domains"
          rows={5}
          spellCheck={false}
          className="font-mono text-xs"
          value={text}
          aria-invalid={problems.length > 0 || clash !== null ? true : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setClash(null);
          }}
        />
        {problems.length > 0 ? (
          <ul className="text-warning space-y-0.5 text-xs">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">Leave it empty to clear every domain. Up to 20.</p>
        )}
        {clash && (
          <p role="alert" className="text-destructive text-sm font-medium">
            {clash}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={problems.length > 0 || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save domains'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function TenantsPage() {
  const { data: tenants, isLoading, isError, refetch } = useTenants();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDomains, setEditingDomains] = useState<Tenant | null>(null);

  const newButton = (
    <Button size="sm" onClick={() => setDialogOpen(true)}>
      <IconPlus />
      New tenant
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Isolated spaces on this deployment — each with its own content, users and data."
        actions={newButton}
      />

      {isLoading ? (
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
                <TableHead>Domains</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{t.slug}</TableCell>
                  <TableCell>
                    {t.domains === undefined ? (
                      <span className="text-muted-foreground text-xs">Not reported by this API</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs">{t.domains.length ? t.domains.join(', ') : 'None'}</span>
                        <Button variant="ghost" size="xs" onClick={() => setEditingDomains(t)}>
                          Edit<span className="sr-only"> domains for {t.name}</span>
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.isActive ? 'default' : 'secondary'}>
                      {t.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TenantMembers />

      <CreateTenantDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <DomainsDialog tenant={editingDomains} onOpenChange={(open) => !open && setEditingDomains(null)} />
    </>
  );
}
