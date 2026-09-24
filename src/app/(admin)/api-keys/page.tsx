'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  supportsKeyContentTypes,
  API_KEY_SCOPES,
  DESTRUCTIVE_API_KEY_SCOPES,
  type CreatedApiKey,
} from '@/hooks/use-api-keys';
import { apiErrorMessage } from '@/lib/api';
import { useApiMeta } from '@/hooks/use-meta';
import { useSchemas } from '@/hooks/use-schemas';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { RevealOnce } from '@/components/patterns/reveal-once';
import { ErrorState } from '@/components/patterns/error-state';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { IconPlus, IconKey, IconTrash } from '@/components/icons';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function CreateApiKeyDialog({
  open,
  onOpenChange,
  limitable,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Whether the API can limit a key to content types. False hides the control entirely. */
  limitable: boolean;
}) {
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const types = useSchemas(open && limitable);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['content:read']);
  const [contentTypes, setContentTypes] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [refused, setRefused] = useState('');
  // Once created, hold the secret so it can be shown ONCE. Cleared on close.
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

  const canSave = name.trim().length > 0 && scopes.length > 0 && !create.isPending;

  function reset() {
    setName('');
    setScopes(['content:read']);
    setContentTypes([]);
    setExpiresAt('');
    setRefused('');
    setCreated(null);
    create.reset();
  }

  function toggleScope(value: string, checked: boolean) {
    setScopes((prev) => (checked ? [...new Set([...prev, value])] : prev.filter((s) => s !== value)));
  }

  function toggleType(value: string, checked: boolean) {
    setContentTypes((prev) => (checked ? [...new Set([...prev, value])] : prev.filter((t) => t !== value)));
  }

  const limited = limitable && contentTypes.length > 0;
  const canPush = scopes.includes('content:write') || scopes.includes('*');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setRefused('');
    try {
      const result = await create.mutateAsync({
        name: name.trim(),
        scopes,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        ...(limited ? { contentTypes } : {}),
      });
      // An API that does not know the field ignores it and mints a key with no limit. That key is
      // not the one asked for, so it is revoked before anybody can copy it.
      if (limited && !Array.isArray(result.contentTypes)) {
        create.reset();
        await revoke.mutateAsync(result.id).catch(() => undefined);
        setRefused(
          'This API does not limit keys to content types, so the key it made had no limit and was revoked. Upgrade the API, or create the key without content types.',
        );
        return;
      }
      setCreated(result); // switch the dialog to the copy-once view
      create.reset(); // the result carries the key, so drop it from the mutation cache now
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not create the key.'));
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
        {created ? (
          <RevealOnce
            className="py-2"
            title="Copy your API key"
            titleAs={DialogTitle}
            description="Store it somewhere safe before you close this."
            descriptionAs={DialogDescription}
            secret={created.key}
            secretLabel="API key"
            testId="api-key-secret"
            dismissLabel="Done"
            onDismiss={() => onOpenChange(false)}
          >
            <p className="text-muted-foreground text-xs">
              Send it as <code className="font-mono">Authorization: Bearer {created.prefix}…</code>
            </p>
          </RevealOnce>
        ) : (
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>
                For machine callers (SDKs, CI, integrations). Scoped to this tenant and the content
                API only.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="key-name">Name</Label>
                <Input
                  id="key-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="CI deploy"
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- focus belongs in a dialog the moment it opens, which is what WAI-ARIA authoring practices ask for. The rule is aimed at autofocus on page load.
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>Scopes</Label>
                <div className="space-y-2 rounded-lg border p-3">
                  {API_KEY_SCOPES.map((s) => (
                    <label key={s.value} htmlFor={`scope-${s.value}`} className="flex items-start gap-2.5">
                      <Checkbox
                        id={`scope-${s.value}`}
                        checked={scopes.includes(s.value)}
                        onCheckedChange={(c) => toggleScope(s.value, c === true)}
                      />
                      <span className="text-sm leading-tight">
                        <span className="font-medium">{s.label}</span>
                        <span className="text-muted-foreground ml-1.5 text-xs">{s.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {scopes.some((s) => DESTRUCTIVE_API_KEY_SCOPES.includes(s)) && (
                  <p role="alert" className="text-destructive text-xs">
                    This key can erase entries and roll back versions. An erased entry cannot be recovered.
                  </p>
                )}
              </div>

              {limitable && (
                <fieldset className="space-y-2">
                  <legend className="text-sm leading-none font-medium">Content types</legend>
                  <p className="text-muted-foreground text-xs">
                    Optional. A key limited to types can only use{' '}
                    <code className="font-mono">POST /api/collections/{'{type}'}/push</code> for those types.
                    Choose none for a key that is not limited.
                  </p>
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                    {types.isLoading ? (
                      <p className="text-muted-foreground text-xs">Reading the content types.</p>
                    ) : types.isError ? (
                      <p className="text-destructive text-xs">The content types could not be read.</p>
                    ) : !types.data?.length ? (
                      <p className="text-muted-foreground text-xs">There are no content types yet.</p>
                    ) : (
                      types.data.map((t) => (
                        <label key={t.name} htmlFor={`type-${t.name}`} className="flex items-center gap-2.5">
                          <Checkbox
                            id={`type-${t.name}`}
                            checked={contentTypes.includes(t.name)}
                            onCheckedChange={(c) => toggleType(t.name, c === true)}
                          />
                          <span className="text-sm leading-tight">{t.displayName || t.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                  {contentTypes.length > 0 && !canPush && (
                    <p className="text-warning text-xs">Pushing needs Write content or Full content access.</p>
                  )}
                </fieldset>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="key-expiry">Expires (optional)</Label>
                <Input
                  id="key-expiry"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-fit"
                />
              </div>
              {refused && (
                <p role="alert" className="text-destructive text-xs">
                  {refused}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave}>
                {create.isPending ? 'Creating…' : 'Create key'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ApiKeysPage() {
  const { data: keys, isLoading, isError, refetch } = useApiKeys();
  const revoke = useRevokeApiKey();
  const { data: meta } = useApiMeta();
  const [dialogOpen, setDialogOpen] = useState(false);
  const limitable = !isLoading && !isError && supportsKeyContentTypes(keys, meta?.version);

  async function onRevoke(id: string, name: string) {
    if (!window.confirm(`Revoke "${name}"? Callers using it will stop working immediately.`)) return;
    try {
      await revoke.mutateAsync(id);
      toast.success(`Revoked "${name}"`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not revoke the key.'));
    }
  }

  const newButton = (
    <Button size="sm" onClick={() => setDialogOpen(true)}>
      <IconPlus />
      New key
    </Button>
  );

  return (
    <>
      <PageHeader
        title="API keys"
        description="Long-lived keys for machine callers — SDKs, CI, integrations — scoped to the content API."
        actions={newButton}
      />

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState entity="API keys" onRetry={() => refetch()} />
      ) : !keys?.length ? (
        <EmptyState
          icon={IconKey}
          title="No API keys yet"
          description="Create a key so a machine caller can authenticate without a human's password."
          action={newButton}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Scopes</TableHead>
                {limitable && <TableHead>Content types</TableHead>}
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{k.prefix}…</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  {limitable && (
                    <TableCell>
                      {k.contentTypes?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {k.contentTypes.map((t) => (
                            <Badge key={t} variant="outline" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Any</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground text-xs">{formatDate(k.lastUsedAt)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{formatDate(k.expiresAt)}</TableCell>
                  <TableCell>
                    <Badge variant={k.revoked ? 'secondary' : 'default'}>
                      {k.revoked ? 'Revoked' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {!k.revoked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onRevoke(k.id, k.name)}
                        aria-label={`Revoke ${k.name}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <IconTrash className="size-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateApiKeyDialog open={dialogOpen} onOpenChange={setDialogOpen} limitable={limitable} />
    </>
  );
}
