'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
import { StatusBadge } from '@/components/patterns/status-badge';
import {
  MAX_TENANT_DOMAINS,
  domainClash,
  domainProblems,
  useCreateTenant,
  useUpdateTenant,
  useVerifyDomain,
  TENANT_STATUSES,
  type Tenant,
  type TenantStatus,
} from '@/hooks/use-tenants';
import { apiErrorMessage } from '@/lib/api';

// Handle rules mirror the server (TenantHandles): 3-40 chars, lowercase alphanumerics + hyphens,
// no leading/trailing hyphen.
export const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const mono = 'font-mono text-xs';

/** What each status does, said where it is picked. From the tenants API contract. */
const STATUS_NOTES: Record<TenantStatus, string> = {
  Active: 'Served normally.',
  Suspended:
    'Delivery answers 404 and authoring 403. No token or key is honoured. Scheduled work waits until the tenant is Active again.',
  Archived: 'Refused exactly as Suspended is. The data is kept.',
};

const SITE_MODE_NOTES: Record<string, string> = {
  Live: 'The public site is served.',
  Holding: 'Visitors see the holding page.',
  Private: 'The public route answers 404.',
};

const SIGN_UP_NOTES: Record<string, string> = {
  NotSet: 'Registration creates an account with no membership here. An administrator adds members.',
  Closed: 'Nobody signs up, and an invitation cannot create an account.',
  InviteOnly: "An administrator's invitation is the way in.",
  Open: 'Anyone who signs up joins with the tenant sign-up role. Set from the API, kept as it is here.',
};

const SIGN_UP_LABELS: Record<string, string> = {
  NotSet: 'Not set',
  Closed: 'Closed',
  InviteOnly: 'Invite only',
  Open: 'Open',
};

/** A dash for a value the API did not report, never the word null. */
export function orDash(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '–' : String(value);
}

/** The Save button says what saving does when that is more than saving. */
export function saveLabel(isNew: boolean, from: TenantStatus | undefined, to: TenantStatus): string {
  if (isNew) return to === 'Active' ? 'Create tenant' : `Create and ${to === 'Suspended' ? 'suspend' : 'archive'}`;
  if (from === to) return 'Save';
  if (to === 'Suspended') return 'Save and suspend';
  if (to === 'Archived') return 'Save and archive';
  return 'Save and reactivate';
}

function tenantStatus(t: Tenant): TenantStatus {
  return t.status ?? (t.isActive ? 'Active' : 'Suspended');
}

function slugFrom(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function Body({ tenant, onClose, onPending }: { tenant: Tenant | null; onClose: () => void; onPending: (p: boolean) => void }) {
  const isNew = tenant === null;
  const create = useCreateTenant();
  const update = useUpdateTenant();
  const verify = useVerifyDomain();

  const readStatus = tenant ? tenantStatus(tenant) : 'Active';
  const [name, setName] = useState(tenant?.name ?? '');
  const [handle, setHandle] = useState('');
  const [handleEdited, setHandleEdited] = useState(false);
  const [status, setStatus] = useState<TenantStatus>(readStatus);
  const [signUp, setSignUp] = useState<string | null>(tenant?.signUp ?? null);
  const [domains, setDomains] = useState<string[]>(tenant?.domains ?? []);
  const [newDomain, setNewDomain] = useState('');
  const [clash, setClash] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);

  const shownHandle = isNew ? (handleEdited ? handle : slugFrom(name)) : tenant.slug;
  const handleValid = HANDLE_RE.test(shownHandle);
  const pending = create.isPending || update.isPending;
  const problems = domainProblems(domains);
  const canSave = name.trim().length > 0 && (!isNew || handleValid) && problems.length === 0 && !pending;
  const reported = tenant?.domains !== undefined || isNew;

  function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (!d || domains.includes(d)) return;
    setDomains([...domains, d]);
    setNewDomain('');
    setClash(null);
  }

  async function checkDomain(domain: string) {
    if (!tenant) return;
    setVerifying(domain);
    try {
      const result = await verify.mutateAsync({ slug: tenant.slug, domain });
      if (result.status === 'Verified') toast.success(`${domain} is verified.`);
      else toast.message(`${domain} is still pending. The DNS record was not found yet.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not check the domain.'));
    } finally {
      setVerifying(null);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setClash(null);
    onPending(true);
    const input = {
      name,
      status,
      signUp,
      signUpRoleId: signUp === 'Open' ? tenant?.signUpRoleId : null,
      domains: reported ? domains : [],
    };
    try {
      if (isNew) {
        await create.mutateAsync({ ...input, handle: shownHandle });
        toast.success(`Tenant "${name.trim()}" created`, {
          description: 'You were added as an admin member, so you can switch to it right away.',
        });
      } else {
        await update.mutateAsync({ slug: tenant.slug, input: { ...input, domains: tenant.domains === undefined ? [] : domains } });
        toast.success(`Saved ${name.trim()}`);
      }
      onClose();
    } catch (err) {
      const message = domainClash(err);
      if (message) setClash(message);
      else toast.error(apiErrorMessage(err, isNew ? 'Could not create the tenant.' : 'Could not save the tenant.'));
    } finally {
      onPending(false);
    }
  }

  const signUpOptions = ['NotSet', 'Closed', 'InviteOnly', ...(tenant?.signUp === 'Open' ? ['Open'] : [])];
  const siteMode = tenant?.siteMode ?? null;

  return (
    <form onSubmit={save} className="grid h-full grid-rows-[auto_1fr_auto]">
      <div className="border-border grid gap-0.5 border-b px-5 py-[18px] pr-14">
        <SheetDescription className="text-xs">Tenants / {isNew ? 'New' : tenant.name}</SheetDescription>
        <SheetTitle className="font-display text-[22px] font-semibold tracking-[-0.02em]">
          {isNew ? 'New tenant' : tenant.name}
        </SheetTitle>
      </div>

      <div className="grid content-start gap-5 overflow-auto p-5">
        <div className="grid gap-1.5">
          <Label htmlFor="tenant-name">Name</Label>
          <Input
            id="tenant-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corporation"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- focus belongs in a rail the moment it opens for a new tenant.
            autoFocus={isNew}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="tenant-handle">Handle</Label>
          <Input
            id="tenant-handle"
            className={mono}
            value={shownHandle}
            readOnly={!isNew}
            onChange={(e) => {
              setHandleEdited(true);
              setHandle(e.target.value.toLowerCase());
            }}
            placeholder="acme"
            aria-invalid={isNew && shownHandle.length > 0 && !handleValid ? true : undefined}
          />
          <p className="text-muted-foreground text-xs">
            {isNew && shownHandle.length > 0 && !handleValid
              ? '3–40 characters, lowercase letters, numbers and hyphens; no leading or trailing hyphen.'
              : 'Used in URLs and the X-Tenant header. Cannot be changed later.'}
          </p>
        </div>

        <fieldset className="grid gap-2">
          <legend className="text-secondary-foreground mb-1 text-[13px] font-semibold">Status</legend>
          <div className="grid gap-2">
            {TENANT_STATUSES.map((s) => (
              <label
                key={s}
                className={`grid cursor-pointer gap-0.5 rounded-[10px] border px-3.5 py-3 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 ${
                  status === s ? 'border-primary bg-accent' : 'border-border'
                }`}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  <input
                    type="radio"
                    aria-label={s}
                    name="tenant-status"
                    value={s}
                    checked={status === s}
                    onChange={() => setStatus(s)}
                    className="accent-primary"
                  />
                  {s}
                </span>
                <span className="text-muted-foreground pl-6 text-[12.5px] leading-normal">{STATUS_NOTES[s]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {!isNew && (
          <div className="grid gap-1.5">
            <span className="text-secondary-foreground text-[13px] font-semibold">Site mode</span>
            <div className="flex items-center gap-2">
              <span className={mono} data-testid="site-mode">
                {orDash(siteMode)}
              </span>
              <Link href="/site" className="text-primary text-xs font-semibold underline-offset-2 hover:underline">
                Change in Site settings
              </Link>
            </div>
            <p className="text-muted-foreground text-xs">
              {siteMode ? (SITE_MODE_NOTES[siteMode] ?? '') : 'This tenant has no site mode yet.'} This page cannot set it.
            </p>
          </div>
        )}

        <div className="grid gap-2">
          <span className="text-secondary-foreground text-[13px] font-semibold">Domains</span>
          {!reported ? (
            <p className="text-muted-foreground text-xs">Not reported by this API.</p>
          ) : (
            <>
              {domains.length === 0 && <p className="text-muted-foreground text-xs">None. Add a host the tenant answers on.</p>}
              <ul className="grid gap-1.5">
                {domains.map((d) => {
                  const state = tenant?.domainStates?.find((s) => s.domain === d);
                  const saved = tenant?.domains?.includes(d) ?? false;
                  return (
                    <li key={d} className="border-border grid gap-1.5 rounded-[10px] border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`${mono} flex-1 truncate`}>{d}</span>
                        {!saved ? (
                          <StatusBadge tone="subtle">Unsaved</StatusBadge>
                        ) : state?.status === 'Verified' ? (
                          <StatusBadge tone="success">Verified</StatusBadge>
                        ) : (
                          <StatusBadge tone="warning">Pending</StatusBadge>
                        )}
                        {saved && state?.status !== 'Verified' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={verifying !== null}
                            onClick={() => void checkDomain(d)}
                          >
                            {verifying === d ? 'Checking…' : 'Verify'}
                            <span className="sr-only"> {d}</span>
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="xs" onClick={() => setDomains(domains.filter((x) => x !== d))}>
                          Remove<span className="sr-only"> {d}</span>
                        </Button>
                      </div>
                      {saved && state?.status !== 'Verified' && state?.txtName && (
                        <p className="text-muted-foreground font-mono text-[11px] break-all">
                          TXT {state.txtName} {state.txtValue}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="flex gap-2">
                <Input
                  aria-label="Add a domain"
                  className={mono}
                  value={newDomain}
                  placeholder="example.com"
                  disabled={domains.length >= MAX_TENANT_DOMAINS}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addDomain();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addDomain} disabled={!newDomain.trim()}>
                  Add
                </Button>
              </div>
              {problems.map((p) => (
                <p key={p} className="text-warning text-xs">
                  {p}
                </p>
              ))}
              {clash && (
                <p role="alert" className="text-destructive text-xs">
                  {clash}
                </p>
              )}
            </>
          )}
        </div>

        <div className="grid gap-2">
          <span className="text-secondary-foreground text-[13px] font-semibold" id="tenant-signup-label">
            Sign-up policy
          </span>
          <SegmentedControl aria-labelledby="tenant-signup-label" value={signUp ?? undefined} onValueChange={setSignUp}>
            {signUpOptions.map((o) => (
              <SegmentedControlItem key={o} value={o} disabled={o === 'Open'}>
                {SIGN_UP_LABELS[o]}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          <p className="text-muted-foreground text-xs">{signUp ? (SIGN_UP_NOTES[signUp] ?? '') : 'Not reported by this API.'}</p>
        </div>
      </div>

      <div className="border-border flex items-center gap-2 border-t px-5 py-3.5">
        <span className="text-muted-foreground flex-1 font-mono text-[11px]">
          {isNew ? 'POST /api/tenants' : `PUT /api/tenants/${tenant.slug}`}
        </span>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant={status === 'Active' ? 'default' : 'destructive'} disabled={!canSave}>
          {pending ? 'Saving…' : saveLabel(isNew, isNew ? undefined : readStatus, status)}
        </Button>
      </div>
    </form>
  );
}

/** The 440px rail for one tenant. `target` is a tenant to edit, `'new'` for an empty one, null when closed. */
export function TenantRail({ target, onClose }: { target: Tenant | 'new' | null; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <SheetContent
        aria-label="Tenant"
        showCloseButton={!pending}
        onEscapeKeyDown={(e) => pending && e.preventDefault()}
        onPointerDownOutside={(e) => pending && e.preventDefault()}
        onInteractOutside={(e) => pending && e.preventDefault()}
        className="w-[min(440px,100%)] gap-0 p-0 sm:max-w-[440px]"
      >
        {target && (
          <Body key={target === 'new' ? 'new' : target.slug} tenant={target === 'new' ? null : target} onClose={onClose} onPending={setPending} />
        )}
      </SheetContent>
    </Sheet>
  );
}
