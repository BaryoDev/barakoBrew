// Types mirroring the backend workflow engine (Models/WorkflowDefinition.cs):
// workflows are content-event triggers that run a list of actions, not a state machine.

export interface WorkflowAction {
    // Server-owned. GET /api/workflows/actions lists the kinds this API instance registers, and a
    // module can add more, so the console must not keep its own list of names.
    type: string;
    parameters: Record<string, string>; // values support {{template}} variables
    /** Read only. The API reports whether a Secret is stored and never returns the value. */
    secretSet?: boolean;
    /**
     * `Halt` stops the actions after this one until it has succeeded; `Continue`, the default, runs
     * them anyway. Absent reads as `Continue`. An API before 4.6 ignores the field.
     */
    onFailure?: WorkflowFailurePolicy | null;
}

export type WorkflowFailurePolicy = 'Continue' | 'Halt';

export interface WorkflowDefinition {
    id?: string;
    name: string;
    triggerContentType: string;
    triggerEvent: TriggerEvent;
    conditions: Record<string, string>;
    actions: WorkflowAction[];
    /**
     * Off means no event starts a run. Absent from an API before 4.6, which has no switch, and
     * absent from a definition stored before the field; both read as on.
     */
    enabled?: boolean;
}

// "transition:Approve" names a transition on the triggering type's own lifecycle. Prefixed so a
// transition can never be confused with a built-in trigger: a type declaring one called "Published"
// would otherwise fire on the status change too.
export type TriggerEvent = 'Created' | 'Updated' | 'Published' | `transition:${string}`;

export interface WorkflowActionMetadata {
    type: string;
    description: string;
    requiredParameters: string[];
    exampleConfiguration: string;
    /**
     * Content, Delivery, Comms, Data or Flow. Null for an action that declares none, and absent from
     * an API older than the field.
     */
    group?: string | null;
}

export interface TemplateVariable {
    name: string; // "{{status}}"
    description: string;
    example: string;
    type: string;
}

export interface TemplateVariableCollection {
    systemVariables: TemplateVariable[];
    dataFields: TemplateVariable[];
    /**
     * The formats and durations a placeholder can carry, each an example to adapt, such as
     * `{{createdAt | date "MMM d, h:mm tt"}}`. Absent from an API before 4.6.
     */
    formats?: TemplateVariable[];
}

export interface WorkflowValidationResult {
    isValid: boolean;
    errors: { field: string; message: string }[];
    /**
     * Placeholders the engine will send as written: a mistyped format or a name it does not know.
     * They do not make the workflow invalid. Absent from an API before 4.6.
     */
    warnings?: { field: string; message: string }[];
    /** The trigger spelled as the content type declares it, when it names a transition. */
    normalisedTriggerEvent?: string | null;
}

export interface ActionExecutionLog {
    actionType: string;
    success: boolean;
    errorMessage?: string;
    resolvedParameters: Record<string, string>;
    duration: string;
}

export interface WorkflowExecutionLog {
    id: string;
    workflowId: string;
    contentId: string;
    executedAt: string;
    isDryRun: boolean;
    /**
     * True when the log was stored without exception messages and parameter values. An API older
     * than 4.2.0 leaves the field out.
     */
    redacted?: boolean;
    success: boolean;
    duration: string;
    actions: ActionExecutionLog[];
}

export interface DryRunResult {
    success: boolean;
    actions: ActionExecutionLog[];
    duration: string;
    message: string;
}
