'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  supportsWorkflowSwitch,
  useDeleteWorkflow,
  useSetWorkflowEnabled,
  useWorkflows,
} from '@/hooks/use-workflows';
import { useAccess } from '@/hooks/use-access';
import {
  RUN_WORKFLOWS_CAPABILITY,
  RUN_WORKFLOWS_LEGACY_ROLES,
  VIEW_RUNS_CAPABILITY,
  useWorkflowHealth,
  type WorkflowHealth,
} from '@/hooks/use-workflow-health';
import { runStatusLabel, toneForRunStatus } from '@/hooks/use-workflow-runs';
import { RecentRuns } from '@/components/workflow/recent-runs';
import { RunNowButton } from '@/components/workflow/run-now';
import { WorkflowHealthTiles } from '@/components/workflow/workflow-health-tiles';
import { WorkflowTimeline, whenText } from '@/components/workflow/workflow-timeline';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Switch } from '@/components/ui/switch';
import { apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { IconPlus, IconTrash, IconWorkflows } from '@/components/icons';
import type { WorkflowDefinition } from '@/types/workflow';

/** The newest outcome the health read lists, which is what the card's chip says. */
function lastOutcome(health: WorkflowHealth | undefined): string | null {
  const newest = [...(health?.lastOutcomes ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return newest?.status ?? null;
}

export default function WorkflowsPage() {
  const { data: workflows, isLoading, isError, refetch } = useWorkflows();
  const setEnabled = useSetWorkflowEnabled();
  const remove = useDeleteWorkflow();
  // An API before 4.6 has neither route, and no workflow it returns carries `enabled`.
  const switchable = supportsWorkflowSwitch(workflows);
  const access = useAccess();
  // Health asks for the same capability the run list does. A caller without it, or an API with no
  // such route (before barakoCMS#1244), sees no tiles and no Recent runs, and the definition still shows.
  const canReadHealth = access.can(VIEW_RUNS_CAPABILITY, ['Admin']);
  const health = useWorkflowHealth(canReadHealth);
  const showHealth = health.data?.available === true;
  // A caller who can read health sees Run now once health has settled, unless it answered 404, so
  // it never flashes and goes. A caller who cannot read it keeps the button, and a 404 from the run
  // shows its message.
  const showRun =
    access.can(RUN_WORKFLOWS_CAPABILITY, RUN_WORKFLOWS_LEGACY_ROLES) && (canReadHealth ? health.offersRun : true);

  // The open workflow. The first one until a person picks another, and the first again if the one
  // they picked is deleted.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const open = workflows?.find((workflow) => workflow.id === pickedId) ?? workflows?.[0];

  const toggle = (id: string, name: string, enabled: boolean) =>
    setEnabled.mutate(
      { id, enabled },
      {
        onSuccess: () => toast.success(enabled ? `Switched "${name}" on` : `Switched "${name}" off`),
        onError: (error) => toast.error(apiErrorMessage(error, 'The workflow could not be switched.')),
      },
    );

  const destroy = (id: string, name: string) =>
    remove.mutate(id, {
      onSuccess: () => toast.success(`Deleted "${name}"`),
      // 409 past 200 queued runs: the message says to switch it off first and let the runner clear them.
      onError: (error) => toast.error(apiErrorMessage(error, 'The workflow could not be deleted.')),
    });

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Automations that react to content events: send email, call webhooks, update fields, and more."
        actions={
          <Button asChild size="sm">
            <Link href="/workflows/new">
              <IconPlus />
              New workflow
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState entity="workflows" onRetry={() => refetch()} />
      ) : !workflows?.length || !open ? (
        <EmptyState
          icon={IconWorkflows}
          title="No workflows yet"
          description="A workflow runs automatically when an entry of a chosen type is created or updated."
          action={
            <Button asChild size="sm">
              <Link href="/workflows/new">
                <IconPlus />
                New workflow
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-4 grid-cols-1 min-[1180px]:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
          <ul aria-label="Workflows" className="grid gap-2">
            {workflows.map((workflow) => {
              const selected = workflow.id === open.id;
              const off = workflow.enabled === false;
              const last = showHealth ? lastOutcome(health.healthOf(workflow.id)) : null;
              return (
                <li
                  key={workflow.id}
                  className={cn(
                    'bg-card flex items-center gap-3 rounded-[14px] border p-4 transition-shadow',
                    selected ? 'border-primary shadow-[var(--shadow-card)]' : 'border-border',
                    off && 'opacity-80',
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPickedId(workflow.id ?? null)}
                    className="grid min-w-0 flex-1 gap-0.5 rounded-md text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span className="truncate text-[15px] font-semibold">{workflow.name}</span>
                    <span className="text-muted-foreground truncate text-[12.5px]">{whenText(workflow)}</span>
                  </button>
                  {off ? (
                    <StatusBadge tone="muted" dot={false}>
                      Off
                    </StatusBadge>
                  ) : (
                    last && (
                      <StatusBadge tone={toneForRunStatus(last)} dot={false}>
                        {runStatusLabel(last)}
                      </StatusBadge>
                    )
                  )}
                  {switchable && workflow.id && (
                    <Switch
                      checked={!off}
                      disabled={setEnabled.isPending}
                      aria-label={`${workflow.name} is on`}
                      onCheckedChange={(checked) => toggle(workflow.id!, workflow.name, checked)}
                    />
                  )}
                </li>
              );
            })}
          </ul>

          <WorkflowPane
            workflow={open}
            health={showHealth ? health.healthOf(open.id) : undefined}
            windowDays={health.windowDays}
            showHealth={showHealth}
            showRun={showRun}
            switchable={switchable}
            deleting={remove.isPending}
            onDelete={destroy}
          />
        </div>
      )}
    </>
  );
}

function WorkflowPane({
  workflow,
  health,
  windowDays,
  showHealth,
  showRun,
  switchable,
  deleting,
  onDelete,
}: {
  workflow: WorkflowDefinition;
  health: WorkflowHealth | undefined;
  windowDays: number | undefined;
  showHealth: boolean;
  showRun: boolean;
  switchable: boolean;
  deleting: boolean;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <section
      aria-label={`${workflow.name} workflow`}
      className="bg-card grid min-w-0 gap-4 rounded-[18px] border p-5 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="font-display min-w-0 flex-1 text-[22px] font-semibold tracking-[-0.02em] break-words">{workflow.name}</h2>
        {workflow.id && (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/workflows/${workflow.id}`}>Open definition</Link>
          </Button>
        )}
        {switchable && workflow.id && (
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Delete ${workflow.name}`}
                className="text-destructive hover:text-destructive"
                disabled={deleting}
              >
                <IconTrash className="size-3.5" />
              </Button>
            }
            title={`Delete "${workflow.name}"?`}
            description="Its waiting runs are cancelled and it never fires again. Finished runs stay in the run history. This cannot be undone. To stop it for now, switch it off instead."
            confirmLabel="Delete"
            destructive
            onConfirm={() => onDelete(workflow.id!, workflow.name)}
          />
        )}
        {showRun && <RunNowButton workflow={workflow} variant="default" />}
      </div>

      <WorkflowTimeline workflow={workflow} />

      {showHealth && <WorkflowHealthTiles health={health} windowDays={windowDays} />}
      {showHealth && workflow.id && <RecentRuns workflowId={workflow.id} />}
    </section>
  );
}
