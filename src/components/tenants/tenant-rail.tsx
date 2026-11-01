'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  domainClash,
  domainProblems,
  tenantStatusLabel,
  TENANT_STATUSES,
  useCreateTenant,
  useUpdateTenant,
  type Tenant,
  type TenantStatus,
} from '@/hooks/use-tenants';
import { apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { IconTrash } from '@/components/icons';

// Handle rules mirror the server (TenantHandles): 3-40 chars, lowercase alphanumerics + hyphens,
// no leading/trailing hyphen. Validated inline so the user sees the rule before submitting.
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const STATUS_CONSEQUENCE: Record<TenantStatus, string> = {
  Active: 'Served. Delivery answers and its users can sign in.',
  Suspended: 'Answers 404 on delivery and 403 to its own signed-in callers. Reversible.',
  Archived: 'Answers 404 on delivery and 403 to its own signed-in callers, like Suspended. Kept for the record.',
};

/** What the save button says it will do, so the consequence is on the button. */
export function saveLabel(from: TenantStatus, to: TenantStatus): string {
  if (from === to) return 'Save changes';
  if (to === 'Suspended') return 'Save and suspend';
  if (to === 'Archived') return 'Save and archive';
  return 'Save and reactivate';
}

function currentStatus(tenant: Tenant): TenantStatus {
  return tenant.status ?? (tenant.isActive ? 'Active' : 'Suspended');
}

function StatusCards({
  value,
  onChange,
  options,
}: {
  value: TenantStatus;
  onChange: (status: TenantStatus) => void;
  options: readonly TenantStatus[];
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Status</legend>
      {options.map((status) => (
        <label
          key={status}
          htmlFor={`tenant-status-${status}`}
          className={cn(
            'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm',
            value === status && 'border-primary bg-secondary',
          )}
        >
          <input
            type="radio"
            id={`tenant-status-${status}`}
            aria-label={status}
            name="tenant-status"
            className="mt-1"
            checked={value === status}
            onChange={() => onChange(status)}
          />
          <span>
            <span className="block font-medium">{status}</span>
            <span className="text-muted-foreground block text-xs">{STATUS_CONSEQUENCE[status]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function DomainsList({
  domains,
  onChange,
  draft,
  setDraft,
  problems,
  clash,
}: {
  domains: string[];
  onChange: (domains: string[]) => void;
  draft: string;
  setDraft: (draft: string) => void;
  problems: string[];
  clash: string | null;
}) {
  function add() {
    const typed = draft.trim();
    if (typed === '') return;
    onChange([...domains, typed]);
    setDraft('');
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="tenant-domain-add">Domains</Label>
      <p className="text-muted-foreground text-xs">
        The hosts this tenant answers on, such as example.com. A domain belongs to one tenant. Up to 20.
      </p>
      {domains.length === 0 ? (
        <p className="text-muted-foreground text-xs">None</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {domains.map((domain, i) => (
            <li key={`${domain}-${i}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="font-mono text-xs">{domain}</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onChange(domains.filter((_, j) => j !== i))}
              >
                <IconTrash />
                <span className="sr-only">Remove {domain}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id="tenant-domain-add"
          className="font-mono text-xs"
          spellCheck={false}
          placeholder="example.com"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add} disabled={draft.trim() === ''}>
          Add domain
        </Button>
      </div>
      {problems.length > 0 && (
        <ul className="text-warning space-y-0.5 text-xs">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {clash && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {clash}
        </p>
      )}
    </div>
  );
}

function EditForm({ tenant, onDone }: { tenant: Tenant; onDone: () => void }) {
  const update = useUpdateTenant();
  const from = currentStatus(tenant);
  const [name, setName] = useState(tenant.name);
  const [status, setStatus] = useState<TenantStatus>(from);
  const [domains, setDomains] = useState<string[]>(tenant.domains ?? []);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [clash, setClash] = useState<string | null>(null);

  // A domain typed but not yet added still counts, so Save never drops what is in the box.
  const pending = draft.trim();
  const allDomains = pending === '' ? domains : [...domains, pending];
  const problems = domainProblems(allDomains);
  const canSave = name.trim() !== '' && problems.length === 0 && !update.isPending;
  // An API before contract 8 has only the flag, so it cannot hold Archived.
  const options = tenant.status ? TENANT_STATUSES : TENANT_STATUSES.filter((s) => s !== 'Archived');
  const takesTenantOffline = status !== from && status !== 'Active';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    if (takesTenantOffline) setConfirming(true);
    else void save();
  }

  async function save() {
    setClash(null);
    try {
      await update.mutateAsync({
        tenant,
        changes: { name, status, ...(tenant.domains === undefined ? {} : { domains: allDomains }) },
      });
      toast.success(`${name.trim()} saved`, { description: `Status: ${status}.` });
      onDone();
    } catch (err) {
      const message = domainClash(err);
      if (message) setClash(message);
      else toast.error(apiErrorMessage(err, 'The tenant could not be saved.'));
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{tenant.name}</SheetTitle>
        <SheetDescription>
          <span className="font-mono text-xs">{tenant.slug}</span>, currently {tenantStatusLabel(tenant)}.
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="tenant-name">Name</Label>
          <Input id="tenant-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <StatusCards value={status} onChange={setStatus} options={options} />
        {tenant.domains === undefined ? (
          <p className="text-muted-foreground text-xs">Domains are not reported by this API.</p>
        ) : (
          <DomainsList
            domains={domains}
            onChange={(next) => {
              setDomains(next);
              setClash(null);
            }}
            draft={draft}
            setDraft={setDraft}
            problems={problems}
            clash={clash}
          />
        )}
      </div>
      <SheetFooter className="border-t">
        <p className="text-muted-foreground font-mono text-xs">PUT /api/tenants/{tenant.slug}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant={status === 'Active' ? 'default' : 'destructive'} disabled={!canSave}>
            {update.isPending ? 'Saving...' : saveLabel(from, status)}
          </Button>
        </div>
      </SheetFooter>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={status === 'Archived' ? 'Archive this tenant?' : 'Suspend this tenant?'}
        description={`${name.trim()} will answer 404 on delivery and 403 to its own signed-in callers until its status is set back to Active.`}
        confirmLabel={status === 'Archived' ? 'Archive tenant' : 'Suspend tenant'}
        destructive
        onConfirm={() => void save()}
      />
    </form>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const create = useCreateTenant();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleEdited, setHandleEdited] = useState(false);
  const [status, setStatus] = useState<TenantStatus>('Active');

  // Derive the handle from the name until the user edits it directly.
  const derivedHandle = handleEdited
    ? handle
    : name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);

  const handleValid = HANDLE_RE.test(derivedHandle);
  const canSave = name.trim().length > 0 && handleValid && !create.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    try {
      await create.mutateAsync({ Handle: derivedHandle, Name: name.trim(), IsActive: status === 'Active' });
      toast.success(`Tenant "${name.trim()}" created`, {
        description: 'You were added as an admin member, so you can switch to it right away.',
      });
      onDone();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not create the tenant.'));
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>New tenant</SheetTitle>
        <SheetDescription>
          A tenant is an isolated space with its own content, users and data. You&apos;ll be added as its
          first admin.
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="tenant-name">Name</Label>
          <Input
            id="tenant-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corporation"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tenant-handle">Handle</Label>
          <Input
            id="tenant-handle"
            className="font-mono text-xs"
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
              ? '3 to 40 characters: lowercase letters, numbers and hyphens, none leading or trailing.'
              : 'Used in URLs and the X-Tenant header. Cannot be changed later.'}
          </p>
        </div>
        <StatusCards value={status} onChange={setStatus} options={['Active', 'Suspended']} />
      </div>
      <SheetFooter className="border-t">
        <p className="text-muted-foreground font-mono text-xs">POST /api/tenants</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSave}>
            {create.isPending ? 'Creating...' : 'Create tenant'}
          </Button>
        </div>
      </SheetFooter>
    </form>
  );
}

/** The right rail that edits one tenant, or creates one when `tenant` is `'new'`. */
export function TenantRail({
  tenant,
  onClose,
}: {
  tenant: Tenant | 'new' | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={tenant !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[440px] sm:max-w-[440px]">
        {tenant === 'new' ? (
          <CreateForm onDone={onClose} />
        ) : tenant ? (
          <EditForm key={tenant.slug} tenant={tenant} onDone={onClose} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
