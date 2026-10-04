import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import type {
    WorkflowDefinition,
    WorkflowActionMetadata,
    TemplateVariableCollection,
    WorkflowValidationResult,
    WorkflowExecutionLog,
    DryRunResult,
} from '@/types/workflow';

export function useWorkflows() {
    return useQuery({
        queryKey: ['workflows'],
        queryFn: async () => {
            const response = await api.get<Paginated<WorkflowDefinition>>('/api/workflows');
            return response.data.items;
        },
    });
}

// The backend has no single-workflow endpoint; select from the cached list.
export function useWorkflow(id: string) {
    const query = useWorkflows();
    return {
        ...query,
        data: query.data?.find((w) => w.id === id),
    };
}

export function useWorkflowActions() {
    return useQuery({
        queryKey: ['workflow-actions'],
        queryFn: async () => {
            const response = await api.get<WorkflowActionMetadata[]>('/api/workflows/actions');
            return response.data;
        },
        staleTime: Infinity, // plugin list only changes with a backend deploy
    });
}

export function useWorkflowVariables(contentType?: string) {
    return useQuery({
        queryKey: ['workflow-variables', contentType],
        queryFn: async () => {
            const response = await api.get<TemplateVariableCollection>('/api/workflows/variables', {
                params: contentType ? { contentType } : {},
            });
            return response.data;
        },
    });
}

export function useWorkflowDebugLogs(id: string, limit = 20) {
    return useQuery({
        queryKey: ['workflow-debug', id, limit],
        queryFn: async () => {
            const response = await api.get<WorkflowExecutionLog[]>(`/api/workflows/${id}/debug`, {
                params: { limit },
            });
            return response.data;
        },
        enabled: !!id,
    });
}

export function useCreateWorkflow() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: WorkflowDefinition) => {
            const response = await api.post<WorkflowDefinition>('/api/workflows', data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
}

/**
 * Whether this API can switch a workflow off and delete one.
 *
 * Both arrived with `enabled` on the workflow, so a list where no workflow carries the field is an
 * API before 4.6, where the routes do not exist. An empty list says nothing either way.
 */
export function supportsWorkflowSwitch(workflows: Pick<WorkflowDefinition, 'enabled'>[] | undefined): boolean {
    return (workflows ?? []).some((workflow) => typeof workflow.enabled === 'boolean');
}

export function useSetWorkflowEnabled() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: { id: string; enabled: boolean }) => {
            const response = await api.put<WorkflowDefinition>(
                `/api/workflows/${encodeURIComponent(input.id)}/enabled`,
                { enabled: input.enabled },
            );
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
}

/** Deletes the definition and cancels its queued runs. The API refuses with 409 past 200 queued runs. */
export function useDeleteWorkflow() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/api/workflows/${encodeURIComponent(id)}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
            queryClient.invalidateQueries({ queryKey: ['workflow-runs'] });
        },
    });
}

export function useValidateWorkflow() {
    return useMutation({
        mutationFn: async (data: WorkflowDefinition) => {
            const response = await api.post<WorkflowValidationResult>('/api/workflows/validate', data);
            return response.data;
        },
    });
}

export function useDryRunWorkflow() {
    return useMutation({
        mutationFn: async (payload: { workflow: WorkflowDefinition; sampleContent: unknown }) => {
            const response = await api.post<DryRunResult>('/api/workflows/dry-run', payload);
            return response.data;
        },
    });
}
