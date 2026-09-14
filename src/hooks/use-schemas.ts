import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import type { ContentTypeDefinition, CreateSchemaRequest, FieldOption } from '@/types/schema';

// enabled is for chrome that only needs the list when the caller may read it. The default is every
// existing caller's behaviour.
export function useSchemas(enabled = true) {
    return useQuery({
        queryKey: ['schemas'],
        queryFn: async () => {
            const response = await api.get<Paginated<ContentTypeDefinition>>('/api/content-types');
            // The envelope stops here. Every caller wants the list, and unwrapping once in the hook
            // keeps the page components out of the pagination contract entirely.
            return response.data.items;
        },
        enabled,
    });
}

// The backend has no single-schema endpoint; select from the cached list.
export function useSchema(name: string) {
    const query = useSchemas();
    return {
        ...query,
        data: query.data?.find((s) => s.name === name),
    };
}

// Public delivery is the one property of an existing content type that can be changed. Everything
// else about a type is create-only, which is why this is its own endpoint rather than part of a
// general update: turning on anonymous access to a whole type is a decision worth making on purpose.
export function useSetPublicDelivery(name: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (enabled: boolean) => {
            const response = await api.put<{ name: string; isPubliclyDeliverable: boolean }>(
                `/api/content-types/${encodeURIComponent(name)}/public-delivery`,
                { enabled },
            );
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schemas'] });
        },
    });
}

// Content types are otherwise create-only on the API — no general update or delete endpoints exist.
export function useCreateSchema() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateSchemaRequest) => {
            const response = await api.post<{ id: string; name: string }>('/api/content-types', data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schemas'] });
        },
    });
}

export interface SetFieldOptionsResult {
    name: string;
    field: string;
    options: FieldOption[];
    /** Values that were options before the call and are not now. */
    removed: string[];
    /** Entries holding a removed value. Zero unless the call was forced. */
    entriesHoldingRemoved: number;
}

/**
 * Replaces a choice field's options with the full ordered list.
 *
 * Removing an option that entries hold is a 409 naming how many, unless `force` is set. Those
 * entries keep their value and are refused on their next save until a value still offered is picked.
 */
export function useSetFieldOptions(name: string, field: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ options, force }: { options: FieldOption[]; force: boolean }) => {
            const response = await api.put<SetFieldOptionsResult>(
                `/api/content-types/${encodeURIComponent(name)}/fields/${encodeURIComponent(field)}/options`,
                { options, force },
            );
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schemas'] });
        },
    });
}
