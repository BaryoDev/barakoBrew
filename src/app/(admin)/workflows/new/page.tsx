'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  useCreateWorkflow,
  useValidateWorkflow,
  useWorkflowActions,
  useWorkflowVariables,
} from '@/hooks/use-workflows';
import { useSchemas } from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import { parameterFields, withoutBlankOptional } from '@/lib/workflow-parameters';
import { useCredentialNameParts } from '@/hooks/use-meta';
import { groupActions, OTHER_ACTION_GROUP } from '@/lib/workflow-action-groups';
import type {
  TriggerEvent,
  WorkflowAction,
  WorkflowActionMetadata,
  WorkflowDefinition,
} from '@/types/workflow';
import { PageHeader } from '@/components/patterns/page-header';
import { ActionIcon } from '@/components/workflow/action-icon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TemplateVariablesHelp } from '@/components/workflow/template-variables-help';
import { RequestParameterField } from '@/components/workflow/request-parameter-field';
import { EmailTemplatePicker, takesTemplate } from '@/components/workflow/email-template-picker';
import { TEMPLATE_PARAMETER } from '@/types/email-template';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconCheckCircle, IconPlus, IconTrash, IconWarning } from '@/components/icons';

export default function NewWorkflowPage() {
  const router = useRouter();
  const { data: schemas } = useSchemas();
  const { data: actionTypes } = useWorkflowActions();
  const credentialParts = useCredentialNameParts();
  // An API older than the group field sends none, so everything lands in Other. Headings would add
  // nothing then, so that case is listed flat, as it was before groups.
  const actionGroups = groupActions(actionTypes ?? []);
  const createWorkflow = useCreateWorkflow();
  const validateWorkflow = useValidateWorkflow();

  const [name, setName] = useState('');
  const [triggerContentType, setTriggerContentType] = useState('');
  const [triggerEvent, setTriggerEvent] = useState<TriggerEvent>('Created');
  const [conditions, setConditions] = useState<{ field: string; value: string }[]>([]);
  const [actions, setActions] = useState<WorkflowAction[]>([]);

  const { data: variables } = useWorkflowVariables(triggerContentType || undefined);

  // A type with its own lifecycle can be triggered on a named transition. Routing an approval on
  // Updated fires on every save, so the supplier is notified on every edit before approval and again
  // after, which is why these are separate options rather than a condition on Updated.
  const transitions = schemas?.find((s) => s.name === triggerContentType)?.lifecycle?.transitions ?? [];

  const definition = (): WorkflowDefinition => ({
    name,
    triggerContentType,
    triggerEvent,
    conditions: Object.fromEntries(
      conditions.filter((c) => c.field.trim()).map((c) => [c.field.trim(), c.value])
    ),
    actions: actions.map((a) => ({
      ...a,
      parameters: withoutBlankOptional(
        withoutTemplateCovered(a),
        actionTypes?.find((m) => m.type === a.type)
      ),
    })),
  });

  const canSave = name.trim() && triggerContentType && actions.length > 0;

  const addAction = (type: string) => {
    const meta = actionTypes?.find((a) => a.type === type);
    const parameters = Object.fromEntries((meta?.requiredParameters ?? []).map((p) => [p, '']));
    setActions((prev) => [...prev, { type, parameters }]);
  };

  // Subject and Body stay in state while a template is chosen, so choosing none brings back what was
  // typed. definition() leaves them out, since the API refuses them with 400 beside a Template.
  const setActionTemplate = (index: number, template: string) => {
    setActions((prev) =>
      prev.map((a, i) => {
        if (i !== index) return a;
        const parameters = { ...a.parameters };
        if (template) {
          parameters[TEMPLATE_PARAMETER] = template;
        } else {
          delete parameters[TEMPLATE_PARAMETER];
          parameters.Subject = parameters.Subject ?? '';
          parameters.Body = parameters.Body ?? '';
        }
        return { ...a, parameters };
      })
    );
  };

  const setActionParam = (index: number, key: string, value: string) => {
    setActions((prev) =>
      prev.map((a, i) => (i === index ? { ...a, parameters: { ...a.parameters, [key]: value } } : a))
    );
  };

  const validate = () => {
    validateWorkflow.mutate(definition(), {
      onSuccess: (result) => {
        if (result.isValid && result.warnings?.length)
          toast.warning(
            `Valid, but these placeholders will be sent as written: ${result.warnings.map((w) => `${w.field}: ${w.message}`).join('; ')}`
          );
        else if (result.isValid) toast.success('The workflow is valid');
        else
          toast.error(
            `Fix before saving: ${result.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`
          );
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Validation could not run.')),
    });
  };

  const save = () => {
    createWorkflow.mutate(definition(), {
      onSuccess: () => {
        toast.success(`Workflow “${name}” created`);
        router.push('/workflows');
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'The workflow could not be created.')),
    });
  };

  return (
    <>
      <PageHeader
        title="New workflow"
        description="Runs after an entry of the chosen type is created, updated, published or moved through a transition. It never blocks saving."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="wf-name">Name</Label>
            <Input
              id="wf-name"
              value={name}
              placeholder="Notify the team on publish"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <ol className="border-border ml-2 space-y-8 border-l pl-6">
            <TimelineStep title="When" accent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wf-trigger-type">When an entry of type…</Label>
                  <Select
                    value={triggerContentType}
                    onValueChange={(v) => {
                      setTriggerContentType(v);
                      // A transition belongs to the type that declares it, so carrying one across is a
                      // trigger the backend refuses at save time with an error about the wrong type.
                      if (triggerEvent.startsWith('transition:')) setTriggerEvent('Created');
                    }}
                  >
                    <SelectTrigger id="wf-trigger-type" className="w-full">
                      <SelectValue placeholder="Choose a content type" />
                    </SelectTrigger>
                    <SelectContent>
                      {schemas?.map((s) => (
                        <SelectItem key={s.name} value={s.name}>
                          {s.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wf-trigger-event">…is</Label>
                  <Select
                    value={triggerEvent}
                    onValueChange={(v) => setTriggerEvent(v as TriggerEvent)}
                  >
                    <SelectTrigger id="wf-trigger-event" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Created">Created</SelectItem>
                      <SelectItem value="Updated">Updated</SelectItem>
                      <SelectItem value="Published">Published</SelectItem>
                      {transitions.map((t) => (
                        <SelectItem key={t.name} value={`transition:${t.name}`}>
                          {t.name} ({t.from} to {t.to})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TimelineStep>

            <TimelineStep title="Only when">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs">
                    Optional field conditions. The workflow runs only if every one matches.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConditions((prev) => [...prev, { field: '', value: '' }])}
                  >
                    <IconPlus />
                    Add condition
                  </Button>
                </div>
                {conditions.map((condition, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder="Field, e.g. Status"
                      value={condition.field}
                      className="font-mono text-xs"
                      onChange={(e) =>
                        setConditions((prev) =>
                          prev.map((c, j) => (j === i ? { ...c, field: e.target.value } : c))
                        )
                      }
                    />
                    <span className="text-muted-foreground text-sm">equals</span>
                    <Input
                      placeholder="Value"
                      value={condition.value}
                      className="font-mono text-xs"
                      onChange={(e) =>
                        setConditions((prev) =>
                          prev.map((c, j) => (j === i ? { ...c, value: e.target.value } : c))
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove condition"
                      onClick={() => setConditions((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <IconTrash className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </TimelineStep>

            <TimelineStep title="Then do">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs">
                    Actions run in order. Parameters accept {'{{variables}}'} from the entry.
                  </p>
                  <Select value="" onValueChange={addAction}>
                    <SelectTrigger size="sm" className="w-40" aria-label="Add an action">
                      <SelectValue placeholder="Add an action" />
                    </SelectTrigger>
                    <SelectContent>
                      {actionGroups.length === 1 && actionGroups[0].name === OTHER_ACTION_GROUP
                        ? actionGroups[0].actions.map((meta) => (
                            <SelectItem key={meta.type} value={meta.type}>
                              {meta.type}
                            </SelectItem>
                          ))
                        : actionGroups.map((group) => (
                            <SelectGroup key={group.name}>
                              <SelectLabel>{group.name}</SelectLabel>
                              {group.actions.map((meta) => (
                                <SelectItem key={meta.type} value={meta.type}>
                                  {meta.type}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                    </SelectContent>
                  </Select>
                </div>

                {actions.length === 0 && (
                  <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                    No actions yet. A workflow needs at least one.
                  </p>
                )}

                {actions.map((action, i) => {
                  const meta = actionTypes?.find((a) => a.type === action.type);
                  return (
                    <div key={i} className="space-y-3 rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <ActionIcon type={action.type} className="text-primary size-4" />
                          {i + 1}. {action.type}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${action.type} action`}
                          onClick={() => setActions((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <IconTrash className="size-3.5" />
                        </Button>
                      </div>
                      {meta?.description && (
                        <p className="text-muted-foreground text-xs">{meta.description}</p>
                      )}
                      {action.type === 'Email' && takesTemplate(meta) && (
                        <EmailTemplatePicker
                          id={`action-${i}-${TEMPLATE_PARAMETER}`}
                          value={action.parameters[TEMPLATE_PARAMETER] ?? ''}
                          subject={action.parameters.Subject ?? ''}
                          body={action.parameters.Body ?? ''}
                          onChange={(template) => setActionTemplate(i, template)}
                        />
                      )}
                      {parameterFields(meta, action.parameters, credentialParts)
                        .filter((field) => !templateCovers(action, meta, field.name))
                        .map((field) => {
                          const id = `action-${i}-${field.name}`;
                          if (isRequestPicker(action.type, field.name))
                            return (
                              <RequestParameterField
                                key={field.name}
                                id={id}
                                value={action.parameters[field.name] ?? ''}
                                onChange={(value) => setActionParam(i, field.name, value)}
                              />
                            );
                          return (
                            <div key={field.name} className="space-y-1.5">
                              <Label htmlFor={id} className="text-xs">
                                {field.name}{' '}
                                {!field.required && (
                                  <span className="text-muted-foreground font-normal">
                                    (optional)
                                  </span>
                                )}
                              </Label>
                              <Input
                                id={id}
                                type={field.secret ? 'password' : 'text'}
                                autoComplete={field.secret ? 'new-password' : undefined}
                                spellCheck={field.secret ? false : undefined}
                                aria-describedby={field.secret ? `${id}-hint` : undefined}
                                value={action.parameters[field.name] ?? ''}
                                className="font-mono text-xs"
                                onChange={(e) => setActionParam(i, field.name, e.target.value)}
                              />
                              {field.secret && (
                                <p id={`${id}-hint`} className="text-muted-foreground text-xs">
                                  Stored encrypted and never shown again, so keep a copy for the
                                  receiving end.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          id={`action-${i}-halt`}
                          checked={action.onFailure === 'Halt'}
                          onCheckedChange={(checked) =>
                            setActions((prev) =>
                              prev.map((a, j) => {
                                if (j !== i) return a;
                                // Left off rather than sent as Continue, so a definition that never
                                // halts looks the same as it always did.
                                const next: WorkflowAction = { ...a };
                                delete next.onFailure;
                                return checked === true
                                  ? { ...next, onFailure: 'Halt' as const }
                                  : next;
                              })
                            )
                          }
                        />
                        <Label htmlFor={`action-${i}-halt`} className="text-xs font-normal">
                          Stop the actions after this one if it fails
                        </Label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TimelineStep>
          </ol>

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={!canSave || createWorkflow.isPending}>
              {createWorkflow.isPending ? 'Creating…' : 'Create workflow'}
            </Button>
            <Button
              variant="outline"
              onClick={validate}
              disabled={!canSave || validateWorkflow.isPending}
            >
              {validateWorkflow.data?.isValid ? (
                <IconCheckCircle className="text-success size-3.5" />
              ) : validateWorkflow.data ? (
                <IconWarning className="text-warning size-3.5" />
              ) : null}
              Validate first
            </Button>
            <Button variant="ghost" onClick={() => router.push('/workflows')}>
              Cancel
            </Button>
          </div>
        </div>

        <aside
          aria-label="Action library and variables"
          className="space-y-6 self-start lg:sticky lg:top-4"
        >
          {actionGroups.length > 0 && (
            <section aria-labelledby="wf-library" className="space-y-3">
              <h2 id="wf-library" className="text-sm font-medium">
                Action library
              </h2>
              {actionGroups.map((group) => (
                <div key={group.name} className="space-y-1">
                  {actionGroups.length > 1 && (
                    <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      {group.name}
                    </h3>
                  )}
                  <ul className="space-y-1">
                    {group.actions.map((meta) => (
                      <li key={meta.type}>
                        <button
                          type="button"
                          aria-describedby={meta.description ? `action-help-${meta.type}` : undefined}
                          onClick={() => addAction(meta.type)}
                          className="hover:bg-accent flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left"
                        >
                          <ActionIcon
                            type={meta.type}
                            className="text-primary mt-0.5 size-3.5 shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="sr-only">Add </span>
                            <span className="block text-sm">{meta.type}</span>
                            {meta.description && (
                              <span
                                id={`action-help-${meta.type}`}
                                aria-hidden="true"
                                className="text-muted-foreground block text-xs"
                              >
                                {meta.description}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
          <TemplateVariablesHelp variables={variables} />
        </aside>
      </div>
    </>
  );
}

/**
 * The Request action names a request definition by slug, and the definition holds the HTTP call
 * itself. Keyed on the core kind, so a module action with a parameter of the same name keeps a
 * plain input.
 */
function isRequestPicker(actionType: string, parameter: string) {
  return actionType === 'Request' && parameter === 'Request';
}

function withoutTemplateCovered(action: WorkflowAction): Record<string, string> {
  if (action.type !== 'Email' || !action.parameters[TEMPLATE_PARAMETER]) return action.parameters;
  const rest = { ...action.parameters };
  delete rest.Subject;
  delete rest.Body;
  return rest;
}

/** The fields an Email action's template picker stands in for: Template itself, and Subject and Body once one is chosen. */
function templateCovers(
  action: WorkflowAction,
  meta: WorkflowActionMetadata | undefined,
  parameter: string
) {
  if (action.type !== 'Email' || !takesTemplate(meta)) return false;
  if (parameter === TEMPLATE_PARAMETER) return true;
  return (
    !!action.parameters[TEMPLATE_PARAMETER] && (parameter === 'Subject' || parameter === 'Body')
  );
}

function TimelineStep({
  title,
  accent = false,
  children,
}: {
  title: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className={`absolute top-0.5 -left-[31px] size-3.5 rounded-full border-2 ${
          accent ? 'border-primary bg-primary' : 'border-primary bg-background'
        }`}
      />
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </li>
  );
}
