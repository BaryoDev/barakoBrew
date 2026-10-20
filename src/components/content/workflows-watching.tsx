'use client';

import Link from 'next/link';
import { useWorkflows } from '@/hooks/use-workflows';
import type { TriggerEvent, WorkflowDefinition } from '@/types/workflow';

/** Says when a trigger fires, in the words the API's events mean. */
export function triggerWording(event: TriggerEvent): string {
  if (event === 'Created') return 'when an entry is created';
  if (event === 'Updated') return 'when an entry is updated';
  if (event === 'Published') return 'when an entry is published';
  return `on the transition ${event.slice('transition:'.length)}`;
}

export function watchingWorkflows(workflows: WorkflowDefinition[] | undefined, contentType: string) {
  return (workflows ?? []).filter(
    (w) => w.triggerContentType === contentType || w.triggerContentTypes?.includes(contentType)
  );
}

/** The workflows that fire on this entry's type. Hidden when the caller cannot list workflows. */
export function WorkflowsWatching({ contentType }: { contentType: string }) {
  const { data, isError } = useWorkflows();
  if (isError) return null;
  const watching = watchingWorkflows(data, contentType);

  return (
    <section aria-label="Workflows watching" className="mt-6 max-w-2xl">
      <h3 className="text-muted-foreground mb-2 font-mono text-xs uppercase tracking-wide">
        Workflows watching
      </h3>
      {watching.length === 0 ? (
        <p className="text-muted-foreground text-sm">No workflow runs on this type.</p>
      ) : (
        <ul className="space-y-1">
          {watching.map((w) => (
            <li key={w.id ?? w.name} className="text-sm">
              {w.id ? (
                <Link href={`/workflows/${w.id}`} className="font-medium underline-offset-2 hover:underline">
                  {w.name}
                </Link>
              ) : (
                <span className="font-medium">{w.name}</span>
              )}{' '}
              <span className="text-muted-foreground">
                runs {triggerWording(w.triggerEvent)}
                {w.enabled === false ? ' (switched off)' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
