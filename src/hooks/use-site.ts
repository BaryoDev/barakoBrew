'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSchemas } from '@/hooks/use-schemas';
import { useContent, useContents } from '@/hooks/use-contents';
import { SITE_BLUEPRINT, SITE_TYPE } from '@/lib/site-settings';
import { ContentStatus, type ContentDetailRead } from '@/types/content';
import type { ContentTypeDefinition } from '@/types/schema';

export type SiteEntryState =
    | { kind: 'loading' }
    | { kind: 'error'; retry: () => void }
    /** The tenant has no `site` type, which is every tenant on an API older than the blueprint. */
    | { kind: 'no-type' }
    | { kind: 'no-entry'; schema: ContentTypeDefinition }
    | { kind: 'entry'; schema: ContentTypeDefinition; entry: ContentDetailRead; stored: number };

/**
 * The tenant's one `site` entry, found the way the single-entry screen finds one: the list filtered
 * by type, oldest first, two rows so a type holding more than one says so.
 */
export function useSiteEntry(): SiteEntryState {
    const schemas = useSchemas();
    const schema = schemas.data?.find((s) => s.name === SITE_TYPE);

    const list = useContents(
        { contentType: SITE_TYPE, page: 1, pageSize: 2, sortOrder: 'asc' },
        schema !== undefined,
    );
    const id = list.data?.items[0]?.id ?? '';
    const detail = useContent(id);

    if (schemas.isLoading) return { kind: 'loading' };
    if (schemas.isError || !schemas.data) return { kind: 'error', retry: () => schemas.refetch() };
    if (!schema) return { kind: 'no-type' };

    if (list.isLoading) return { kind: 'loading' };
    if (list.isError || !list.data) return { kind: 'error', retry: () => list.refetch() };
    if (!id) return { kind: 'no-entry', schema };

    if (detail.isLoading) return { kind: 'loading' };
    if (detail.isError || !detail.data) return { kind: 'error', retry: () => detail.refetch() };
    return { kind: 'entry', schema, entry: detail.data, stored: list.data.totalItems };
}

/** Creates the `site` type from the API's blueprint. A 409 means it exists already. */
export function useApplySiteBlueprint() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () =>
            (await api.post(`/api/content-types/blueprints/${SITE_BLUEPRINT}`, {})).data,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schemas'] });
            queryClient.invalidateQueries({ queryKey: ['contents'] });
        },
    });
}

export interface SaveSiteInput {
    /** The stored entry, or null to create it. */
    entry: ContentDetailRead | null;
    /** Only the fields this screen changed. */
    changes: Record<string, unknown>;
    /** Omitted keeps the entry's status, and creates a draft. */
    status?: ContentStatus;
}

/**
 * The request a save sends.
 *
 * An update carries the whole stored document with the changes laid over it, because the API
 * replaces `data` and the Site and Theme screens each own only some of its fields. Sending only the
 * changes would wipe whatever the other screen saved.
 */
export function siteWriteRequest({ entry, changes, status }: SaveSiteInput) {
    if (!entry) {
        return {
            method: 'post' as const,
            url: '/api/contents',
            body: { contentType: SITE_TYPE, data: changes, status: status ?? ContentStatus.Draft },
            etag: undefined,
        };
    }
    return {
        method: 'put' as const,
        url: `/api/contents/${entry.id}`,
        body: {
            id: entry.id,
            data: { ...entry.data, ...changes },
            status: status ?? entry.status,
            version: entry.version,
        },
        etag: entry.etag,
    };
}

export function useSaveSite() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: SaveSiteInput) => {
            const request = siteWriteRequest(input);
            const config = request.etag ? { headers: { 'If-Match': request.etag } } : undefined;
            const response =
                request.method === 'post'
                    ? await api.post<{ id: string; version: number }>(request.url, request.body)
                    : await api.put<{ id: string; version: number }>(request.url, request.body, config);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contents'] });
        },
    });
}
