'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isNotFound } from '@/lib/api';
import { SECRET_MUTATION } from '@/lib/secrets';
import { reportedMaxShareLinkDays, type CreatedShareLink, type ShareLink, type ShareLinkScope } from '@/lib/share-links';

/**
 * `disabled` is a 404 from the list: this API has no share links for this scope.
 *
 * The 404 is the only signal available here, unlike the page tree. Share links are served by core
 * (`Features/Site/ShareLinks`), not by a module, so `GET /api/modules` has nothing to say about
 * them and a deployment either has the endpoint or is older than it.
 */
export type ShareLinksState =
    | { kind: 'disabled' }
    | {
          kind: 'links';
          links: ShareLink[];
          /** What the API says the longest expiry is, in days, or null when it says nothing. */
          maxExpiryDays: number | null;
      };

export function shareLinksKey(scope: ShareLinkScope): readonly string[] {
    return ['share-links', ...scope.key];
}

export interface CreateShareLinkInput {
    label: string;
    expiresAt?: string;
}

function readLinks(data: unknown): ShareLink[] {
    if (Array.isArray(data)) return data as ShareLink[];
    const items = (data as { items?: unknown } | null | undefined)?.items;
    return Array.isArray(items) ? (items as ShareLink[]) : [];
}

export function useShareLinks(scope: ShareLinkScope) {
    return useQuery({
        queryKey: shareLinksKey(scope),
        queryFn: async (): Promise<ShareLinksState> => {
            try {
                const { data } = await api.get<unknown>(scope.path);
                return { kind: 'links', links: readLinks(data), maxExpiryDays: reportedMaxShareLinkDays(data) };
            } catch (error) {
                if (isNotFound(error)) return { kind: 'disabled' };
                throw error;
            }
        },
    });
}

export function useCreateShareLink(scope: ShareLinkScope) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: CreateShareLinkInput) => (await api.post<CreatedShareLink>(scope.path, input)).data,
        ...SECRET_MUTATION,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: shareLinksKey(scope) }),
    });
}

export function useRevokeShareLink(scope: ShareLinkScope) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`${scope.path}/${encodeURIComponent(id)}`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: shareLinksKey(scope) }),
    });
}
