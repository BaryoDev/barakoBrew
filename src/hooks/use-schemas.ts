import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import type {
    ContentTypeDefinition,
    CreateSchemaRequest,
    FieldOption,
    UniquenessRule,
} from '@/types/schema';

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

const typePath = (name: string) => `/api/content-types/${encodeURIComponent(name)}`;
const fieldPath = (name: string, field: string) => `${typePath(name)}/fields/${encodeURIComponent(field)}`;

export interface FieldPresentation {
    editor: string | null;
    section: string | null;
    role: string | null;
}

/**
 * Sets a stored field's editor hint, section and role. The three go together: one left out is
 * cleared, so the caller sends the two it is not changing as they stand.
 */
export function useSetFieldPresentation(name: string, field: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (presentation: FieldPresentation) => {
            const response = await api.put<FieldPresentation & { name: string; field: string }>(
                `${fieldPath(name, field)}/presentation`,
                presentation,
            );
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schemas'] });
        },
    });
}

/** Sets or clears where a type's entries live on the site. Null clears it. */
export function useSetRouteTemplate(name: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (routeTemplate: string | null) => {
            const response = await api.put<{ name: string; routeTemplate: string | null }>(
                `${typePath(name)}/route-template`,
                { routeTemplate },
            );
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schemas'] });
        },
    });
}

export interface SetFieldCurrencyResult {
    name: string;
    field: string;
    currency: string | null;
    scale: number | null;
    /** Entries holding an amount the scale refuses. Zero unless the call was forced. */
    entriesNotFitting: number;
    /** Entries holding an amount stored under another code. Zero unless the call was forced. */
    entriesRelabelled: number;
}

/**
 * Declares, changes or clears a money field's currency. A change entries do not fit is a 409 that
 * says how many, unless `force` is set; no entry is rewritten either way.
 */
export function useSetFieldCurrency(name: string, field: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (body: { currency: string | null; scale: number | null; force: boolean }) => {
            const response = await api.put<SetFieldCurrencyResult>(`${fieldPath(name, field)}/currency`, body);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schemas'] });
        },
    });
}

export interface SetUniquenessResult {
    name: string;
    uniqueness: UniquenessRule[] | null;
    /** For each rule added or changed, how many entries already share their values. */
    duplicates: { rule: string; entries: number }[];
}

/**
 * Replaces a type's uniqueness rules with the full list; an empty list removes them. A rule entries
 * already break is a 409 with the count per rule, unless `force` is set.
 */
export function useSetUniqueness(name: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ uniqueness, force }: { uniqueness: UniquenessRule[]; force: boolean }) => {
            const response = await api.put<SetUniquenessResult>(`${typePath(name)}/uniqueness`, {
                uniqueness,
                force,
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schemas'] });
        },
    });
}

/** One entry sharing its values under a rule with another. Ids and times only, never values. */
export interface DuplicateEntry {
    id: string;
    createdAt: string;
}

export const DUPLICATES_PAGE_SIZE = 20;

/** The entries sharing their values under a rule, oldest first, a page at a time. */
export function useUniquenessDuplicates(name: string, rule: string, page: number, enabled = true) {
    return useQuery({
        queryKey: ['schemas', 'uniqueness-duplicates', name, rule, page],
        queryFn: async () =>
            (
                await api.get<Paginated<DuplicateEntry>>(
                    `${typePath(name)}/uniqueness/${encodeURIComponent(rule)}/duplicates`,
                    { params: { page, pageSize: DUPLICATES_PAGE_SIZE } },
                )
            ).data,
        enabled,
    });
}
