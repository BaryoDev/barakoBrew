import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isNotFound } from '@/lib/api';
import { fieldValue, PAGE_FIELDS, readTree, withField, type TreeView } from '@/lib/page-tree';
import type { ContentDetail } from '@/types/content';

/** `disabled` is a 404 from the tree endpoint: the Pages module is not enabled on this API. */
export type PageTreeState = { kind: 'disabled' } | TreeView;

export const PAGE_TREE_KEY = ['pages', 'tree'] as const;

export function usePageTree() {
    return useQuery({
        queryKey: PAGE_TREE_KEY,
        queryFn: async (): Promise<PageTreeState> => {
            try {
                const response = await api.get('/api/pages/tree');
                return readTree(response.data);
            } catch (error) {
                if (isNotFound(error)) return { kind: 'disabled' };
                throw error;
            }
        },
    });
}

/**
 * Someone else moved the page after the tree was read.
 *
 * Raised for a 412 from the save, and also when the entry read back just before the save already has
 * a different parent from the one the tree showed. Without the second check the save would succeed
 * and quietly undo their move, since the read that supplies the version is newer than the tree.
 */
export class PageChangedError extends Error {
    constructor() {
        super('Someone else changed this page. It has been reloaded.');
        this.name = 'PageChangedError';
    }
}

/**
 * Sets fields on one page through the ordinary content update, with `If-Match`.
 *
 * `fields` maps a field name to its new value; undefined removes the field, which is how a page
 * becomes a top-level page. `expectedParent`, when given, is the parent the tree showed.
 */
export async function writePageFields(
    id: string,
    fields: Record<string, unknown>,
    expectedParent?: string | null,
): Promise<void> {
    const read = await api.get<ContentDetail>(`/api/contents/${id}`);
    const entry = read.data;

    if (expectedParent !== undefined) {
        const stored = fieldValue(entry.data, PAGE_FIELDS.parent);
        const storedParent = typeof stored === 'string' && stored !== '' ? stored.toLowerCase() : null;
        if (storedParent !== (expectedParent?.toLowerCase() ?? null)) throw new PageChangedError();
    }

    let data = entry.data;
    for (const [name, value] of Object.entries(fields)) data = withField(data, name, value);

    const etag = read.headers?.etag;
    try {
        await api.put(
            `/api/contents/${id}`,
            { id, data, status: entry.status, version: entry.version },
            etag ? { headers: { 'If-Match': etag } } : undefined,
        );
    } catch (error) {
        if ((error as { response?: { status?: number } })?.response?.status === 412) throw new PageChangedError();
        throw error;
    }
}

export interface CreateRedirectRequest {
    fromPath: string;
    toPath: string;
    permanent: boolean;
    note?: string;
}

export function useCreateRedirect() {
    return useMutation({
        mutationFn: async (request: CreateRedirectRequest) => {
            const response = await api.post('/api/redirects', request);
            return response.data;
        },
    });
}

export function useInvalidatePageTree() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: PAGE_TREE_KEY });
        queryClient.invalidateQueries({ queryKey: ['contents'] });
    };
}
