'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isNotFound } from '@/lib/api';
import type { CreatedShareLink, ShareLink } from '@/lib/site-mode';

/** `disabled` is a 404 from the list: this API has no share links. */
export type ShareLinksState = { kind: 'disabled' } | { kind: 'links'; links: ShareLink[] };

export const SHARE_LINKS_KEY = ['site', 'share-links'] as const;

const URL = '/api/site/share-links';

export interface CreateShareLinkInput {
    label: string;
    expiresAt?: string;
}

export function useShareLinks() {
    return useQuery({
        queryKey: SHARE_LINKS_KEY,
        queryFn: async (): Promise<ShareLinksState> => {
            try {
                const { data } = await api.get<ShareLink[] | { items: ShareLink[] }>(URL);
                return { kind: 'links', links: Array.isArray(data) ? data : (data?.items ?? []) };
            } catch (error) {
                if (isNotFound(error)) return { kind: 'disabled' };
                throw error;
            }
        },
    });
}

export function useCreateShareLink() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: CreateShareLinkInput) => (await api.post<CreatedShareLink>(URL, input)).data,
        // The result carries the key. Dropped from the mutation cache as soon as nothing observes it.
        gcTime: 0,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: SHARE_LINKS_KEY }),
    });
}

export function useRevokeShareLink() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`${URL}/${encodeURIComponent(id)}`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: SHARE_LINKS_KEY }),
    });
}
