// Types mirroring the backend workflow engine (Models/WorkflowDefinition.cs):
// workflows are content-event triggers that run a list of actions, not a state machine.

export interface WorkflowAction {
    // Server-owned. GET /api/workflows/actions lists the kinds this API instance registers, and a
    // module can add more, so the console must not keep its own list of names.
    type: string;
    parameters: Record<string, string>; // values support {{template}} variables
    /** Read only. The API reports whether a Secret is stored and never returns the value. */
    secretSet?: boolean;
}

export interface WorkflowDefinition {
    id?: string;
    name: string;
    triggerContentType: string;
    triggerEvent: TriggerEvent;
    conditions: Record<string, string>;
    actions: WorkflowAction[];
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
}

export interface WorkflowValidationResult {
    isValid: boolean;
    errors: { field: string; message: string }[];
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
