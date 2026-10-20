'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PaginationControls } from '@/components/patterns/pagination-controls';
import { IconPlay } from '@/components/icons';
import { useAccess } from '@/hooks/use-access';
import { useContents } from '@/hooks/use-contents';
import { useDebounced } from '@/hooks/use-debounced';
import { useCurrentTenant } from '@/hooks/use-tenants';
import {
  RUN_WORKFLOWS_CAPABILITY,
  RUN_WORKFLOWS_LEGACY_ROLES,
  runNowMessage,
  useRunWorkflow,
} from '@/hooks/use-workflow-health';
import { contentTitle } from '@/lib/content-title';
import { apiErrorMessage } from '@/lib/api';
import { uuidV4 } from '@/lib/uuid';
import type { ContentListItem } from '@/types/content';

export interface RunNowWorkflow {
  id?: string;
  name: string;
  triggerContentType: string;
  triggerContentTypes?: string[] | null;
  enabled?: boolean;
}

/** Every type the workflow fires on, as the API counts them: the single type first, then the list, each once. */
export function triggerTypes(workflow: Pick<RunNowWorkflow, 'triggerContentType' | 'triggerContentTypes'>): string[] {
  const all = [workflow.triggerContentType, ...(workflow.triggerContentTypes ?? [])];
  return all.filter((type, i) => !!type?.trim() && all.indexOf(type) === i);
}

/** Run now is offered when the workflow is switched on. A workflow with no `enabled` field counts as on. */
export function canRunNow(workflow: Pick<RunNowWorkflow, 'enabled'>): boolean {
  return workflow.enabled !== false;
}

/**
 * Starts a workflow on one entry. Always through a confirm step: the run sends real email and
 * webhooks.
 *
 * Hidden without the `run_workflows` capability (or the Admin role, against an API that cannot say
 * what a caller holds), and when `available` is false because this API has no such route.
 */
export function RunNowButton({
  workflow,
  available = true,
  size = 'sm',
}: {
  workflow: RunNowWorkflow;
  available?: boolean;
  size?: 'sm' | 'icon';
}) {
  const access = useAccess();
  const [open, setOpen] = useState(false);
  const offReasonId = useId();

  if (!available || !workflow.id || !access.can(RUN_WORKFLOWS_CAPABILITY, RUN_WORKFLOWS_LEGACY_ROLES)) return null;

  const runnable = canRunNow(workflow);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled={!runnable}
        title={runnable ? undefined : 'Switch the workflow on to run it.'}
        aria-describedby={runnable ? undefined : offReasonId}
        aria-label={size === 'icon' ? `Run ${workflow.name} now` : undefined}
        onClick={() => setOpen(true)}
      >
        <IconPlay className="size-3.5" />
        {size === 'icon' ? null : 'Run now'}
      </Button>
      {!runnable && (
        <span id={offReasonId} className="sr-only">
          Switch the workflow on to run it.
        </span>
      )}
      {/* Mounted only while open, so every open starts on the first step with a new idempotency
          key, and a close (cancel or success) throws both away. */}
      {open && <RunNowDialog workflow={workflow as RunNowWorkflow & { id: string }} onClose={() => setOpen(false)} />}
    </>
  );
}

function RunNowDialog({ workflow, onClose }: { workflow: RunNowWorkflow & { id: string }; onClose: () => void }) {
  const router = useRouter();
  const run = useRunWorkflow();
  const types = triggerTypes(workflow);
  const [contentType, setContentType] = useState(types[0] ?? workflow.triggerContentType);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<ContentListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useDebounced(search, 300);

  // The key belongs to the entry. The same confirm sent twice finds the first run instead of
  // starting two, and another entry never rides on a key the server already recorded for this one.
  const keys = useRef(new Map<string, string>());
  function keyFor(entryId: string): string {
    let key = keys.current.get(entryId);
    if (!key) {
      key = uuidV4();
      keys.current.set(entryId, key);
    }
    return key;
  }

  // An entry read under one tenant is never posted under another tenant's token.
  const tenant = useCurrentTenant();
  const openedUnder = useRef(tenant);
  useEffect(() => {
    if (tenant !== openedUnder.current) onClose();
  }, [tenant, onClose]);

  // A ref, not `run.isPending`: the second click of a double click lands before React renders the
  // pending state, so only a flag set in the same tick as the first click stops the second request.
  const inFlight = useRef(false);

  const entries = useContents({
    contentType,
    search: query || undefined,
    page,
    pageSize: 10,
  });

  async function start() {
    if (!chosen || inFlight.current) return;
    inFlight.current = true;
    setError(null);

    try {
      const started = await run.mutateAsync({ workflowId: workflow.id, entryId: chosen.id, idempotencyKey: keyFor(chosen.id) });
      toast.success(started.repeated ? 'That run was already started. Opening it.' : 'Run queued.');
      onClose();
      router.push(`/workflow-runs?run=${encodeURIComponent(started.runId)}`);
    } catch (failure) {
      // 403, 404 (workflow or entry gone), 400 (wrong content type) and 409 (switched off, or
      // conditions) are all shown here, and none of them opens a run.
      setError(runNowMessage(failure));
    } finally {
      inFlight.current = false;
    }
  }

  const items = entries.data?.items ?? [];

  return (
    <Dialog open onOpenChange={(next) => !next && !run.isPending && onClose()}>
      <DialogContent>
        {chosen ? (
          <>
            <DialogHeader>
              <DialogTitle>Run &quot;{workflow.name}&quot; on this entry?</DialogTitle>
              <DialogDescription>
                It runs now, as if the entry had just triggered it. Its actions send real email and call real
                webhooks. The workflow&apos;s conditions are still checked.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border px-3 py-2 text-sm">
              <p className="font-medium">{contentTitle(chosen.data, chosen.id)}</p>
              <p className="text-muted-foreground font-mono text-xs">{chosen.id}</p>
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={run.isPending}
                onClick={() => {
                  setChosen(null);
                  setError(null);
                }}
              >
                Back
              </Button>
              <Button type="button" disabled={run.isPending} aria-busy={run.isPending} onClick={() => void start()}>
                {run.isPending ? 'Starting…' : 'Run now'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Run &quot;{workflow.name}&quot; now</DialogTitle>
              <DialogDescription>
                Pick the {contentType} entry to run it on. You confirm on the next step.
              </DialogDescription>
            </DialogHeader>
            {types.length > 1 && (
              <select
                aria-label="Entry type"
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                value={contentType}
                onChange={(event) => {
                  setContentType(event.target.value);
                  setPage(1);
                }}
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            )}
            <Input
              type="search"
              aria-label="Search entries"
              placeholder={`Search ${contentType} entries`}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            {entries.isLoading ? (
              <p className="text-muted-foreground py-6 text-center text-sm">Searching…</p>
            ) : entries.isError ? (
              <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
                <p className="text-muted-foreground text-sm">
                  {apiErrorMessage(entries.error, 'The entries could not be read.')}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => void entries.refetch()}>
                  Try again
                </Button>
              </div>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {query ? 'No entries match that search.' : `There are no ${contentType} entries yet.`}
              </p>
            ) : (
              <ul aria-label="Entries" className="max-h-72 space-y-1 overflow-y-auto">
                {items.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm"
                      onClick={() => {
                        setChosen(entry);
                        setError(null);
                      }}
                    >
                      <span className="truncate">{contentTitle(entry.data, entry.id)}</span>
                      <span className="text-muted-foreground ml-auto font-mono text-[11px]">{entry.id.slice(0, 8)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {entries.data && <PaginationControls page={entries.data} onPageChange={setPage} />}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
