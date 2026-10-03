'use client';

import { Fragment, useState, useSyncExternalStore } from 'react';
import { useSchemas } from '@/hooks/use-schemas';
import type { ContentTypePermission, PermissionAction, RoleRequest } from '@/types/rbac';
import { emptyPermission } from '@/types/rbac';
import { getContractServerState, getContractState, subscribeToContract } from '@/lib/api-contract';
import { KNOWN_CAPABILITIES, holdsCapability, isPlatformCapability } from '@/lib/capabilities';
import { conditionProblem, isEmptyPermission, writeConditions } from '@/lib/role-rules';
import { PermissionDetails, type ConditionDraft } from '@/components/rbac/permission-details';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IconChevronDown, IconChevronRight, IconTimes } from '@/components/icons';

const ACTIONS: PermissionAction[] = ['create', 'read', 'update', 'delete'];

/**
 * Conditions that follow a reference and field sets arrived with API contract 6 (barakoCMS 4.6). An
 * older API saves neither check and ignores the sets, so the editor for them is not offered there.
 * What a role already holds is sent back either way.
 */
const RULE_DETAILS_CONTRACT = 6;

function splitKey(key: string): [string, PermissionAction] {
  const at = key.lastIndexOf(':');
  return [key.slice(0, at), key.slice(at + 1) as PermissionAction];
}

interface RoleEditorProps {
  initial?: RoleRequest;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (role: RoleRequest) => void;
  onCancel: () => void;
}

export function RoleEditor({ initial, submitLabel, isPending, onSubmit, onCancel }: RoleEditorProps) {
  const { data: schemas } = useSchemas();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [permissions, setPermissions] = useState<ContentTypePermission[]>(initial?.permissions ?? []);
  const [capabilities, setCapabilities] = useState<string[]>(initial?.systemCapabilities ?? []);
  const [capabilityDraft, setCapabilityDraft] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [conditionDrafts, setConditionDrafts] = useState<Record<string, ConditionDraft>>({});
  const contract = useSyncExternalStore(subscribeToContract, getContractState, getContractServerState);
  const detailsSupported = contract.kind === 'ok' && contract.version >= RULE_DETAILS_CONTRACT;

  const permissionFor = (slug: string) =>
    permissions.find((p) => p.contentTypeSlug === slug) ?? emptyPermission(slug);

  const toggle = (slug: string, action: PermissionAction, enabled: boolean) => {
    setPermissions((prev) => {
      const existing = prev.find((p) => p.contentTypeSlug === slug);
      const base = existing ?? emptyPermission(slug);
      const updated = { ...base, [action]: { ...base[action], enabled } };
      const rest = prev.filter((p) => p.contentTypeSlug !== slug);
      return isEmptyPermission(updated) ? rest : [...rest, updated];
    });
  };

  const replacePermission = (permission: ContentTypePermission) =>
    setPermissions((prev) => prev.map((p) => (p.contentTypeSlug === permission.contentTypeSlug ? permission : p)));

  const toggleCapability = (name: string, on: boolean) =>
    setCapabilities((prev) =>
      on ? (holdsCapability(prev, name) ? prev : [...prev, name]) : prev.filter((c) => c.toLowerCase() !== name.toLowerCase()),
    );

  const otherCapabilities = capabilities.filter(
    (c) => !KNOWN_CAPABILITIES.some((known) => known.name === c.toLowerCase()),
  );

  // Only drafts on a rule that is still allowed are sent. A condition on a rule turned off is kept
  // as stored, since the editor for it was not on screen.
  const liveDrafts = Object.entries(conditionDrafts).filter(([key]) => {
    const [slug, action] = splitKey(key);
    return permissions.some((p) => p.contentTypeSlug === slug && p[action]?.enabled);
  });
  const conditionsBlocked = liveDrafts.some(([, draft]) => draft.rows.some((row) => conditionProblem(row) !== null));

  const withConditions = (list: ContentTypePermission[]) =>
    list.map((permission) => {
      let next = permission;
      for (const [key, draft] of liveDrafts) {
        const [slug, action] = splitKey(key);
        if (slug !== permission.contentTypeSlug) continue;
        next = { ...next, [action]: { ...next[action], conditions: writeConditions(draft.rows, draft.kept) } };
      }
      return next;
    });

  const addCapability = () => {
    const value = capabilityDraft.trim();
    if (value && !holdsCapability(capabilities, value)) {
      setCapabilities((prev) => [...prev, value]);
    }
    setCapabilityDraft('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || conditionsBlocked) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      permissions: withConditions(permissions),
      systemCapabilities: capabilities,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="role-name">Name</Label>
          <Input
            id="role-name"
            value={name}
            placeholder="Editor"
            required
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role-description">Description</Label>
          <Textarea
            id="role-description"
            value={description}
            rows={1}
            placeholder="What this role is for (optional)"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Content permissions</h3>
        <p className="text-muted-foreground text-xs">
          Grants are additive across a user&apos;s roles — any role that allows an action allows it.
        </p>
        {!schemas?.length ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
            No content types exist yet, so there is nothing to grant. Create a content type first.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Content type</TableHead>
                  {ACTIONS.map((action) => (
                    <TableHead key={action} className="w-20 text-center capitalize">
                      {action}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {schemas.map((schema) => {
                  const permission = permissionFor(schema.name);
                  const expanded = detailsSupported && open === schema.name;
                  const granted = permissions.find((p) => p.contentTypeSlug === schema.name);
                  return (
                    <Fragment key={schema.name}>
                    <TableRow>
                      <TableCell>
                        {detailsSupported && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="mr-1"
                            aria-expanded={expanded}
                            aria-label={`Conditions and field limits for ${schema.displayName}`}
                            onClick={() => setOpen(expanded ? null : schema.name)}
                          >
                            {expanded ? <IconChevronDown /> : <IconChevronRight />}
                          </Button>
                        )}
                        <span className="font-medium">{schema.displayName}</span>
                        <span className="text-muted-foreground ml-2 font-mono text-xs">{schema.name}</span>
                      </TableCell>
                      {ACTIONS.map((action) => (
                        <TableCell key={action} className="text-center">
                          <Checkbox
                            checked={permission[action].enabled}
                            onCheckedChange={(checked) => toggle(schema.name, action, checked === true)}
                            aria-label={`Allow ${action} on ${schema.displayName}`}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                    {expanded && (
                      <TableRow>
                        <TableCell colSpan={ACTIONS.length + 1} className="bg-muted/30 whitespace-normal">
                          {granted ? (
                            <PermissionDetails
                              schema={schema}
                              permission={granted}
                              drafts={{
                                read: conditionDrafts[`${schema.name}:read`],
                                update: conditionDrafts[`${schema.name}:update`],
                                delete: conditionDrafts[`${schema.name}:delete`],
                              }}
                              onDraft={(action, draft) =>
                                setConditionDrafts((prev) => ({ ...prev, [`${schema.name}:${action}`]: draft }))
                              }
                              onPermission={replacePermission}
                            />
                          ) : (
                            <p className="text-muted-foreground text-xs">
                              Allow an action on {schema.displayName} first. Conditions and field limits belong to an
                              action.
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Separator />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">System capabilities</legend>
        <p className="text-muted-foreground text-xs">
          A platform capability reaches past one tenant, so only a SuperAdmin can give a user a role that holds one.
        </p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 pt-1 sm:grid-cols-2">
          {KNOWN_CAPABILITIES.map((capability) => {
            const id = `capability-${capability.name}`;
            const platform = isPlatformCapability(capability.name);
            return (
              <div key={capability.name} className="flex items-start gap-2">
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  checked={holdsCapability(capabilities, capability.name)}
                  onCheckedChange={(checked) => toggleCapability(capability.name, checked === true)}
                  aria-describedby={capability.hint || platform ? `${id}-hint` : undefined}
                />
                <div className="text-sm leading-tight">
                  <label htmlFor={id}>{capability.label}</label>
                  <span className="text-muted-foreground ml-1.5 font-mono text-xs">{capability.name}</span>
                  {platform && (
                    <Badge variant="outline" className="ml-1.5 text-xs">
                      Platform
                    </Badge>
                  )}
                  {(capability.hint || platform) && (
                    <p id={`${id}-hint`} className="text-muted-foreground text-xs">
                      {[capability.hint, platform ? 'Only a SuperAdmin can give a role holding this to a user.' : null]
                        .filter(Boolean)
                        .join(' ')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="capability">Other capabilities</Label>
        <p className="text-muted-foreground text-xs">
          A module&apos;s capability not listed above, e.g. upload_files. Press Enter to add.
        </p>
        <div className="flex gap-2">
          <Input
            id="capability"
            value={capabilityDraft}
            placeholder="manage_users"
            className="max-w-xs font-mono text-xs"
            onChange={(e) => setCapabilityDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCapability();
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={addCapability}>
            Add
          </Button>
        </div>
        {otherCapabilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {otherCapabilities.map((capability) => (
              <Badge key={capability} variant="secondary" className="gap-1 font-mono font-normal">
                {capability}
                <button
                  type="button"
                  aria-label={`Remove ${capability}`}
                  onClick={() => setCapabilities((prev) => prev.filter((c) => c !== capability))}
                >
                  <IconTimes className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!name.trim() || isPending || conditionsBlocked}>
          {isPending ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
