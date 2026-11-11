import { triggerLabel } from '@/hooks/use-workflow-runs';
import type { WorkflowDefinition } from '@/types/workflow';

/** What an action is set up with, on one line: its parameters, and that a secret is held without showing it. */
export function actionDetail(action: WorkflowDefinition['actions'][number]): string {
  const parts = Object.entries(action.parameters ?? {}).map(([key, value]) => `${key}: ${value}`);
  if (action.secretSet) parts.push('Secret: set, not shown');
  return parts.join(' · ');
}

/** The trigger in words, "post to Published". */
export function whenText(workflow: Pick<WorkflowDefinition, 'triggerContentType' | 'triggerEvent'>): string {
  return `${workflow.triggerContentType} to ${triggerLabel(workflow.triggerEvent)}`;
}

/** The When banner and the workflow's actions in order, each a numbered node on a line. */
export function WorkflowTimeline({ workflow }: { workflow: WorkflowDefinition }) {
  return (
    <div>
      <div className="bg-accent flex items-center gap-3.5 rounded-xl px-3.5 py-3">
        <span className="text-accent-foreground text-[11.5px] font-semibold tracking-[0.06em] uppercase">When</span>
        <span className="text-[14.5px] font-semibold">{whenText(workflow)}</span>
      </div>
      {workflow.actions.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-[13px]">This workflow has no actions yet.</p>
      ) : (
        <ol aria-label="Actions" className="mt-1">
          {workflow.actions.map((action, i) => {
            const detail = actionDetail(action);
            return (
              <li key={i} className="group grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                <div aria-hidden className="flex flex-col items-center">
                  <span className="bg-border h-3.5 w-0.5" />
                  <span className="bg-secondary text-muted-foreground grid size-[26px] place-items-center rounded-lg font-mono text-[11.5px]">
                    {i + 1}
                  </span>
                  <span className="bg-border min-h-3.5 w-0.5 flex-1 group-last:hidden" />
                </div>
                <div className="bg-background border-border my-2.5 grid min-w-0 gap-1 rounded-xl border px-3.5 py-3">
                  <span className="text-primary font-mono text-[12px]">{action.type}</span>
                  {detail && <span className="text-muted-foreground font-mono text-[13px] break-words">{detail}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
