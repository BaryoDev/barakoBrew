import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated, type PageParams } from '@/lib/api';
import type {
    ContentListItem,
    ContentDetail,
    ContentDetailRead,
    ContentVersion,
    CreateContentRequest,
    UpdateContentRequest,
    ContentStatus,
    ScheduleContentRequest,
} from '@/types/content';

export function useContents(
    params: PageParams & { contentType?: string; search?: string; status?: ContentStatus } = {},
    // Off keeps the list unfetched, for a caller that only needs it once a control is opened. The
    // default is the behaviour every existing caller already has.
    enabled = true
) {
    return useQuery({
        queryKey: ['contents', 'list', params],
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
            // History is a collection like any other and uses the paginated envelope. It read
            // `versions` here, which the endpoint stopped returning when the envelope landed, so the
            // panel has been rendering an empty list rather than failing visibly.
            const response = await api.get<Paginated<ContentVersion>>(`/api/contents/${id}/history`);
            return response.data.items;
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
            return response.data;
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
