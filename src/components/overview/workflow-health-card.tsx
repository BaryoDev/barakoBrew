'use client';

import Link from 'next/link';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconArrowRight } from '@/components/icons';
import { HealthTile } from '@/components/workflow/health-tile';
import { useWorkflows } from '@/hooks/use-workflows';
import { useWorkflowHealth } from '@/hooks/use-workflow-health';

/**
 * The last outcomes per workflow. Hidden against an API without the health route, and says so
 * when the read fails rather than claiming the workflows have no runs.
 */
export function WorkflowHealthCard() {
  const { data: workflows, isLoading, isError: workflowsFailed } = useWorkflows();
  const health = useWorkflowHealth();

  if (health.unavailable) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Workflow health</CardTitle>
        <CardAction>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground -my-1">
            <Link href="/workflow-runs">
              Runs
              <IconArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {health.isError || workflowsFailed ? (
          <p className="text-muted-foreground text-sm">Workflow health could not be read.</p>
        ) : isLoading ? null : !workflows?.length ? (
          <p className="text-muted-foreground text-sm">No workflows yet.</p>
        ) : (
          <ul className="divide-y">
            {workflows.slice(0, 5).map((workflow) => (
              <li key={workflow.id} className="flex items-start justify-between gap-4 py-2.5">
                <Link href={`/workflows/${workflow.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                  {workflow.name}
                </Link>
                <HealthTile health={health.healthOf(workflow.id)} windowDays={health.windowDays} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
