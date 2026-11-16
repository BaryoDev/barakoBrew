'use client';

import axios from 'axios';
import { useState } from 'react';
import { useRolePreview, useUsers } from '@/hooks/use-rbac';
import { useSchemas } from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import type { ContentTypePermission, RolePreviewItem, RolePreviewReason } from '@/types/rbac';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { IconWarning } from '@/components/icons';

const SELECT_CLASS = 'border-input bg-background h-9 w-full rounded-md border px-2 text-sm';

const REASONS: Record<RolePreviewReason, string> = {
  'outside branch scope': "Outside this user's branch scope.",
  'no read rule': 'No role of this user has a read rule for this type.',
  'condition not met': 'The read condition is not met by this entry.',
  'field rules hide it': 'The field rules hide every field of this entry.',
};

/** What the operator reads when the preview call fails. The server's own text is kept for a 400. */
export function previewErrorMessage(error: unknown): string {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 403) {
    return 'You cannot preview this role. A platform role, or a new platform capability, needs manage_platform_roles.';
  }
  if (status === 404) {
    return 'That user or role was not found. It may have been deleted. Pick the user again.';
  }
  return apiErrorMessage(error, 'The preview could not run.');
}

interface RolePreviewPanelProps {
  /** The stored role being edited. Absent for a role that is not saved yet. */
  roleId?: string;
  name: string;
  permissions: ContentTypePermission[];
  systemCapabilities: string[];
}

function Entry({ item }: { item: RolePreviewItem }) {
  return (
    <li className="grid gap-1 rounded-lg border px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{item.title || item.id}</span>
        <StatusBadge tone={item.visible ? 'success' : 'warning'}>{item.visible ? 'Visible' : 'Hidden'}</StatusBadge>
      </div>
      {!item.visible && item.reason && (
        <p className="text-muted-foreground text-xs">{REASONS[item.reason] ?? item.reason}</p>
      )}
      {!item.visible && item.condition && (
        <p className="text-muted-foreground text-xs">
          Failed condition: <code className="font-mono break-all">{item.condition}</code>
        </p>
      )}
      {item.visible && (
        <p className="text-muted-foreground text-xs">
          Readable fields:{' '}
          {item.readableFields === null ? (
            'every field'
          ) : item.readableFields.length === 0 ? (
            'none'
          ) : (
            <span className="font-mono">{item.readableFields.join(', ')}</span>
          )}
        </p>
      )}
    </li>
  );
}

/**
 * "Preview as": runs the editor's unsaved rules against real entries as one user. It sends the
 * editor's current state, so it answers for what is on screen, not for what is stored.
 */
export function RolePreviewPanel({ roleId, name, permissions, systemCapabilities }: RolePreviewPanelProps) {
  const { data: users, isLoading: usersLoading, isError: usersError } = useUsers({ pageSize: 100 });
  const { data: schemas } = useSchemas();
  const preview = useRolePreview();
  const [userId, setUserId] = useState('');
  const [contentType, setContentType] = useState('');

  const run = () =>
    preview.mutate({
      userId,
      contentType,
      permissions,
      // Only a stored role has an id. For a new role the server reads the draft alone.
      ...(roleId ? { roleId } : {}),
      systemCapabilities,
      name: name.trim() || undefined,
    });

  const items = preview.data?.items ?? [];

  return (
    <section aria-labelledby="role-preview" className="border-border bg-card grid gap-3 rounded-2xl border p-5">
      <div>
        <h2 id="role-preview" className="font-display text-[17px] font-semibold tracking-[-0.02em]">
          Preview as
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Pick a user and a content type to see which entries this role, as edited here, would show them. Nothing is
          saved.
        </p>
      </div>

      {usersError ? (
        <p role="alert" className="text-warning flex items-start gap-2 text-[13px]">
          <IconWarning aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>The users could not be loaded, so there is nobody to preview as. Reload the page to try again.</span>
        </p>
      ) : !usersLoading && !users?.items.length ? (
        <p className="text-muted-foreground text-sm">There are no users to preview as yet.</p>
      ) : !schemas?.length ? (
        <p className="text-muted-foreground text-sm">No content types exist yet, so there is nothing to preview.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="preview-user">User</Label>
            <select
              id="preview-user"
              className={SELECT_CLASS}
              value={userId}
              disabled={usersLoading}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">{usersLoading ? 'Loading users…' : 'Pick a user'}</option>
              {users?.items.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="preview-type">Content type</Label>
            <select
              id="preview-type"
              className={SELECT_CLASS}
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
            >
              <option value="">Pick a content type</option>
              {schemas.map((schema) => (
                <option key={schema.name} value={schema.name}>
                  {schema.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!userId || !contentType || preview.isPending}
          onClick={run}
        >
          {preview.isPending ? 'Running…' : 'Preview'}
        </Button>
      </div>

      <div aria-live="polite" className="min-w-0">
        {preview.isPending ? (
          <TableSkeleton rows={3} />
        ) : preview.isError ? (
          <p role="alert" className="text-warning flex items-start gap-2 text-[13px]">
            <IconWarning aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{previewErrorMessage(preview.error)}</span>
          </p>
        ) : preview.data && items.length === 0 ? (
          <p className="text-muted-foreground text-sm">There are no entries of this type to preview.</p>
        ) : preview.data ? (
          <ul className="grid gap-2">
            {items.map((item) => (
              <Entry key={item.id} item={item} />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
