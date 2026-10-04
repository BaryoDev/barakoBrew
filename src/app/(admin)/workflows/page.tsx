'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  supportsWorkflowSwitch,
  useDeleteWorkflow,
  useSetWorkflowEnabled,
  useWorkflows,
} from '@/hooks/use-workflows';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { apiErrorMessage } from '@/lib/api';
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
import { IconBolt, IconPlus, IconTrash, IconWorkflows } from '@/components/icons';

export default function WorkflowsPage() {
  const router = useRouter();
  const { data: workflows, isLoading, isError, refetch } = useWorkflows();
  const setEnabled = useSetWorkflowEnabled();
  const remove = useDeleteWorkflow();
  // An API before 4.6 has neither route, and no workflow it returns carries `enabled`.
  const switchable = supportsWorkflowSwitch(workflows);

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
        description="Automations that react to content events — send email, call webhooks, update fields, and more."
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
      ) : !workflows?.length ? (
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
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="hidden sm:table-cell">Actions</TableHead>
                {switchable && <TableHead>On</TableHead>}
                {switchable && (
                  <TableHead className="w-10">
                    <span className="sr-only">Delete</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.map((workflow) => (
                <TableRow
                  key={workflow.id}
                  className={workflow.enabled === false ? 'cursor-pointer opacity-70' : 'cursor-pointer'}
                  onClick={() => router.push(`/workflows/${workflow.id}`)}
                >
                  <TableCell className="font-medium">{workflow.name}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-sm">
                      <IconBolt className="text-primary size-3.5" />
                      <span className="font-mono text-xs">{workflow.triggerContentType}</span>
                      <span className="text-muted-foreground">· {workflow.triggerEvent}</span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {workflow.actions.map((action, i) => (
                        <Badge key={i} variant="secondary" className="font-normal">
                          {action.type}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  {switchable && workflow.id && (
                    // The row opens the workflow on click, so the controls keep their clicks.
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={workflow.enabled !== false}
                        disabled={setEnabled.isPending}
                        aria-label={`${workflow.name} is on`}
                        onCheckedChange={(checked) => toggle(workflow.id!, workflow.name, checked)}
                      />
                    </TableCell>
                  )}
                  {switchable && workflow.id && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ConfirmDialog
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${workflow.name}`}
                            className="text-destructive hover:text-destructive"
                            disabled={remove.isPending}
                          >
                            <IconTrash className="size-3.5" />
                          </Button>
                        }
                        title={`Delete "${workflow.name}"?`}
                        description="Its waiting runs are cancelled and it never fires again. Finished runs stay in the run history. This cannot be undone. To stop it for now, switch it off instead."
                        confirmLabel="Delete"
                        destructive
                        onConfirm={() => destroy(workflow.id!, workflow.name)}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
