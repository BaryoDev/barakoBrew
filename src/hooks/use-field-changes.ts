import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isForbidden, isNotFound } from '@/lib/api';
import { useCurrentTenant } from '@/hooks/use-tenants';

export type FieldChangeState = 'running' | 'completed' | 'abandoned' | 'completed_with_skips';

/** One entry a change passed over, with the exception type name the server recorded. */
export interface SkippedEntry {
    entryId: string;
    reason: string;
    at: string;
}

/** A field change as the API sends it. Only the fields the panel reads are typed. */
export interface FieldChange {
    id: string;
    contentType: string;
    field: string;
    kind: string;
    state: FieldChangeState;
    step: number;
    steps: number;
    processed: number;
    total: number;
    valuesLost: number;
    error: string | null;
    startedAt: string;
    completedAt: string | null;
    abandonedAt: string | null;
    abandonedBy: string | null;
    skippedCount?: number | null;
    skipped?: SkippedEntry[] | null;
    retryOf: string | null;
    retriedBy: string | null;
}

export interface FieldChangePage {
    items: FieldChange[];
    page: number;
    pageSize: number;
    totalItems: number;
}

export const FIELD_CHANGES_PAGE_SIZE = 20;
const POLL_MS = 5000;

/**
 * A type's field changes, newest first, a page at a time. Null when the list is not there for this
 * caller: a 404 (an API older than the route, or no such type) or a 403 (no right to manage types).
 * While a change on the page is running the page is read again every few seconds.
 */
export function useFieldChanges(name: string, page: number) {
    // The tenant is in the key, as in useSchemas, so a type of the same name in another tenant never
    // shows this tenant's changes.
    const tenant = useCurrentTenant();
    return useQuery({
        queryKey: ['field-changes', tenant, name, page],
        queryFn: async (): Promise<FieldChangePage | null> => {
            try {
                const { data } = await api.get<FieldChangePage>(
                    `/api/content-types/${encodeURIComponent(name)}/field-changes`,
                    { params: { page, pageSize: FIELD_CHANGES_PAGE_SIZE } },
                );
                // A body that is not a list is a failed read, not an empty list.
                if (!data || !Array.isArray((data as Partial<FieldChangePage>).items)) {
                    throw new Error('The field changes came back in a shape this console does not know.');
                }
                return data;
            } catch (error) {
                if (isNotFound(error) || isForbidden(error)) return null;
                throw error;
            }
        },
        // The previous page stays on screen while the next loads, but only for the same type in the
        // same tenant: another tenant's list is never shown in its place.
        placeholderData: (previous, previousQuery) =>
            previousQuery?.queryKey[1] === tenant && previousQuery?.queryKey[2] === name
                ? keepPreviousData(previous)
                : undefined,
        refetchInterval: (query) =>
            query.state.data?.items?.some((change) => change.state === 'running') ? POLL_MS : false,
    });
}

/** Starts a full pass over a change that finished with skips. The API answers 202 with the new change. */
export function useRetryFieldChange(name: string) {
    const queryClient = useQueryClient();
    const tenant = useCurrentTenant();

    return useMutation({
        mutationFn: async (id: string) =>
            (await api.post<FieldChange>(`/api/content-types/field-changes/${encodeURIComponent(id)}/retry`)).data,
        // On an error too: a 409 says the change is no longer as the row shows it.
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['field-changes', tenant, name] }),
    });
}
