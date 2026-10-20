'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useContentHistory, useRollbackContent } from '@/hooks/use-contents';
import { apiErrorMessage } from '@/lib/api';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { IconRollback } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { ContentVersion } from '@/types/content';

/** What a version card calls the change. Only Created and Updated carry a document. */
export function describeVersion(v: ContentVersion): string {
  switch (v.changeType) {
    case 'Created': return 'Created';
    case 'Updated': return 'Edited';
    case 'StatusChanged': return v.status ? `Status set to ${v.status}` : 'Status changed';
    case 'Scheduled': return 'Scheduling changed';
    case 'SensitivityChanged':
      return v.sensitivity ? `Sensitivity set to ${v.sensitivity}` : 'Sensitivity changed';
    default: return v.changeType;
  }
}

/**
 * The versions of one entry, newest first, in a 290px column beside the editor.
 *
 * Choosing a card previews its document. Restore is offered on an older version that carries a
 * document, to a caller who holds the rollback capability: a status-only version has nothing to
 * restore, and the role gate is the one the History tab already used.
 */
export function VersionRail({ id, canRollback }: { id: string; canRollback: boolean }) {
  const { data: versions, isLoading, isError, refetch } = useContentHistory(id, true);
  const rollback = useRollbackContent();
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <aside aria-label="Versions" className="w-full shrink-0 lg:w-[290px]">
      <h3 className="text-muted-foreground mb-2 font-mono text-xs uppercase tracking-wide">Versions</h3>
      {isLoading ? (
        <TableSkeleton rows={3} />
      ) : isError ? (
        <p className="text-destructive text-sm">
          The versions could not be loaded.{' '}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      ) : !versions?.length ? (
        <p className="text-muted-foreground text-sm">No earlier versions recorded.</p>
      ) : (
        <RailList
          // The API returns oldest first; the top card is the current state.
          ordered={[...versions].reverse()}
          chosen={chosen}
          onChoose={setChosen}
          canRollback={canRollback}
          restoring={rollback.isPending}
          onRestore={(versionId) =>
            rollback.mutate(
              { id, versionId },
              {
                onSuccess: () => toast.success('Version restored'),
                onError: (error) => toast.error(apiErrorMessage(error, 'The version could not be restored.')),
              }
            )
          }
        />
      )}
    </aside>
  );
}

function RailList({
  ordered,
  chosen,
  onChoose,
  canRollback,
  restoring,
  onRestore,
}: {
  ordered: ContentVersion[];
  chosen: string | null;
  onChoose: (versionId: string) => void;
  canRollback: boolean;
  restoring: boolean;
  onRestore: (versionId: string) => void;
}) {
  const selected = chosen ?? ordered[0].versionId;

  return (
    <ol className="space-y-2">
      {ordered.map((version, i) => {
        const isCurrent = i === 0;
        const isSelected = version.versionId === selected;
        return (
          <li
            key={version.versionId}
            className={cn('rounded-lg border p-3', isCurrent && 'border-primary')}
          >
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChoose(version.versionId)}
              className="block w-full text-left"
            >
              <span className="block text-sm font-medium">
                {isCurrent ? `${describeVersion(version)} (current)` : describeVersion(version)}
              </span>
              <span className="text-muted-foreground block font-mono text-xs">
                {version.changeType}
                {version.lastModifiedBy ? ` · ${version.lastModifiedBy}` : ''}
              </span>
              <span className="text-muted-foreground block font-mono text-xs">
                {format(new Date(version.timestamp), 'PPpp')}
              </span>
            </button>
            {isSelected && version.data && (
              <pre
                data-testid="version-preview"
                className="bg-muted text-muted-foreground mt-2 max-h-48 overflow-auto rounded-md p-2 font-mono text-xs"
              >
                {JSON.stringify(version.data, null, 2)}
              </pre>
            )}
            {!isCurrent && canRollback && version.data && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="sm" className="mt-2" disabled={restoring}>
                    <IconRollback className="size-3.5" />
                    Restore this version
                  </Button>
                }
                title="Restore this version?"
                description="The entry's fields go back to this version's values. The change is recorded as a new version, so nothing is lost."
                confirmLabel="Restore"
                onConfirm={() => onRestore(version.versionId)}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
