import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, paginatedSchema, parseResponse, type Paginated, type PageParams } from '@/lib/api';
import type {
    ContentListItem,
    ContentDetail,
    ContentDetailRead,
    CreateContentRequest,
    UpdateContentRequest,
    ContentStatus,
    ScheduleContentRequest,
} from '@/types/content';
import { contentVersionSchema } from '@/types/content';
import { useCurrentTenant } from '@/hooks/use-tenants';

export function useContents(
    params: PageParams & { contentType?: string; search?: string; status?: ContentStatus } = {},
    // Off keeps the list unfetched, for a caller that only needs it once a control is opened. The
    // default is the behaviour every existing caller already has.
    enabled = true
) {
    // The tenant is part of the key, so another tenant's entries never sit on screen while the
    // new tenant's load. Last, so the ['contents'] prefixes mutations invalidate on still match.
    const tenant = useCurrentTenant();
    return useQuery({
        queryKey: ['contents', 'list', params, tenant],
        queryFn: async () => {
            const response = await api.get<Paginated<ContentListItem>>('/api/contents', { params });
            return response.data;
        },
        enabled,
    });
}

// enabled is for a caller that already has the entry and only needs this when it does not, such as
// a reference picker resolving an id it has not listed. The default is every existing caller's
// behaviour.
export function useContent(id: string, enabled = true) {
    return useQuery({
        queryKey: ['contents', 'detail', id],
        queryFn: async (): Promise<ContentDetailRead> => {
            const response = await api.get<ContentDetail>(`/api/contents/${id}`);
            // The ETag rides on the response headers, not in the body, and is what the save sends
            // back as `If-Match`. Readable from a browser only because the API exposes it through
            // CORS; without that header it is invisible to JavaScript and this is undefined.
            return { ...response.data, etag: response.headers?.etag };
        },
        enabled: !!id && enabled,
    });
}

export function useContentHistory(id: string, enabled = true) {
    return useQuery({
        queryKey: ['contents', 'history', id],
        queryFn: async () => {
            // Parsed, because this is where reading `versions` from an `items` envelope once
            // rendered an empty list for months instead of failing.
            const response = await api.get<unknown>(`/api/contents/${id}/history`);
            return parseResponse(
                paginatedSchema(contentVersionSchema),
                response.data,
                'GET /api/contents/{id}/history'
            ).items;
        },
        enabled: !!id && enabled,
    });
}

export function useCreateContent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateContentRequest) => {
            const response = await api.post<{ id: string; version: number }>('/api/contents', data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contents'] });
        },
    });
}

export function useUpdateContent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            data,
            etag,
        }: {
            id: string;
            data: UpdateContentRequest;
            etag?: string;
        }) => {
            // Both guards, on purpose. `If-Match` is the API's stronger one, bound to the
            // document's own version; the `version` in the body is the older path and is what an
            // API predating the ETag still checks. Sending both costs nothing and keeps a console
            // pointed at an older server protected.
            //
            // Omitted entirely when there is no ETag rather than sent empty: `If-Match: ""` is
            // refused as malformed with a 400, which would turn a working save into a broken one
            // for every event-sourced type, since the server does not emit an ETag for those.
            const response = await api.put<{ id: string; version: number }>(
                `/api/contents/${id}`,
                { id, ...data },
                etag ? { headers: { 'If-Match': etag } } : undefined
            );
            // The write answers with the ETag of what it just wrote, and a screen that stays open
            // has to keep it: the next save from the same screen needs an `If-Match`, and a
            // deployment with Content:Concurrency:Require on refuses a write that carries none with
            // a 428. Undefined for an event-sourced type, which the API sends no ETag for.
            return { ...response.data, etag: response.headers?.etag as string | undefined };
        },
        onSuccess: (_data, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['contents'] });
            queryClient.invalidateQueries({ queryKey: ['contents', 'detail', id] });
        },
    });
}

export function useScheduleContent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, schedule }: { id: string; schedule: ScheduleContentRequest }) => {
            const response = await api.put<{ id: string }>(`/api/contents/${id}/schedule`, {
                id,
                ...schedule,
            });
            return response.data;
        },
        onSuccess: (_data, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['contents'] });
            queryClient.invalidateQueries({ queryKey: ['contents', 'detail', id] });
        },
    });
}

export function useUpdateContentStatus() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, status }: { id: string; status: ContentStatus }) => {
            const response = await api.put<{ message: string }>(`/api/contents/${id}/status`, {
                id,
                newStatus: status,
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contents'] });
        },
    });
}

// SuperAdmin/Admin only.
export function useRollbackContent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, versionId }: { id: string; versionId: string }) => {
            const response = await api.post(`/api/contents/${id}/rollback/${versionId}`, {});
            return response.data;
        },
        onSuccess: (_data, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['contents'] });
            queryClient.invalidateQueries({ queryKey: ['contents', 'detail', id] });
            queryClient.invalidateQueries({ queryKey: ['contents', 'history', id] });
        },
    });
}

/**
 * Moves an entry of a type with its own lifecycle through a named transition. `data` carries the
 * values of the fields the transition requires or allows, and is left out when there are none, as
 * an API older than transition fields expects.
 */
export function useTransitionContent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            transition,
            data,
        }: {
            id: string;
            transition: string;
            data?: Record<string, unknown>;
        }) => {
            const body: Record<string, unknown> = { id, transition };
            if (data && Object.keys(data).length > 0) body.data = data;
            const response = await api.put<{ message: string }>(`/api/contents/${id}/status`, body);
            return response.data;
        },
        onSuccess: (_data, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['contents'] });
            queryClient.invalidateQueries({ queryKey: ['contents', 'detail', id] });
        },
    });
}
