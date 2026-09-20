import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isConflict, isNotFound } from '@/lib/api';
import { saveConcurrently, SaveConflictError, type SaveBase } from '@/lib/concurrent-save';
import { isModuleEnabled, readModules } from '@/hooks/use-modules';
import { MODULE } from '@/types/modules';
import { fieldValue, readTree, withField, type TreeView } from '@/lib/page-tree';
import type { ContentDetail } from '@/types/content';

/** `disabled` is this API not serving a page tree: the Pages module is not enabled on it. */
export type PageTreeState = { kind: 'disabled' } | TreeView;

export const PAGE_TREE_KEY = ['pages', 'tree'] as const;

/**
 * The page tree, or `disabled` when the deployment does not run Pages.
 *
 * Asked of `GET /api/modules` first, so the answer is the API's own inventory rather than an
 * inference from a failure. The 404 is still handled, because the module list is not always
 * readable: it needs SuperAdmin or Admin, and an older API does not serve it at all. Reading the
 * module list through the query cache means the rail has usually already paid for it.
 */
export function usePageTree() {
    const client = useQueryClient();
    return useQuery({
        queryKey: PAGE_TREE_KEY,
        queryFn: async (): Promise<PageTreeState> => {
            if (isModuleEnabled(await readModules(client), MODULE.pages) === false) {
                return { kind: 'disabled' };
            }
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
 * a different parent or order from the one the tree showed. Without the second check the save would
 * succeed and quietly undo their move, since the read that supplies the version is newer than the tree.
 */
export class PageChangedError extends Error {
    constructor() {
        super('Someone else changed this page. It has been reloaded.');
        this.name = 'PageChangedError';
    }
}

/** One page as it was read, and the status a write has to send back with it. */
interface PageSnapshot extends SaveBase {
    status: ContentDetail['status'];
}

/** Where the tree showed a page, and the field names that place is stored under. */
export interface ExpectedPlace {
    parentField: string;
    parentId: string | null;
    orderField: string;
    order: number | null;
}

/** An order as the API reads it: an integer, or a string holding one. Anything else is no order. */
function storedOrder(value: unknown): number | null {
    if (typeof value === 'number') return Number.isInteger(value) ? value : null;
    if (typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value)) return Number.parseInt(value, 10);
    return null;
}

/**
 * Sets fields on one page through the ordinary content update, with `If-Match`.
 *
 * `fields` maps a field name to its new value; undefined removes the field, which is how a page
 * becomes a top-level page. `expected`, when given, is where the tree showed the page.
 */
export async function writePageFields(
    id: string,
    fields: Record<string, unknown>,
    expected?: ExpectedPlace,
): Promise<void> {
    // Read again on a refused write as well as before the first one, so the expected-place check
    // runs against whatever is stored now rather than against the copy the write was refused for.
    const snapshot = async (): Promise<PageSnapshot> => {
        const read = await api.get<ContentDetail>(`/api/contents/${id}`);
        const entry = read.data;

        if (expected) {
            const stored = fieldValue(entry.data, expected.parentField);
            const storedParent = typeof stored === 'string' && stored !== '' ? stored.toLowerCase() : null;
            if (storedParent !== (expected.parentId?.toLowerCase() ?? null)) throw new PageChangedError();
            if (storedOrder(fieldValue(entry.data, expected.orderField)) !== expected.order) throw new PageChangedError();
        }

        return {
            data: entry.data,
            version: entry.version,
            etag: read.headers?.etag,
            status: entry.status,
        };
    };

    const base = await snapshot();

    let edit = base.data;
    for (const [name, value] of Object.entries(fields)) edit = withField(edit, name, value);

    try {
        await saveConcurrently<PageSnapshot, unknown>({
            base,
            edit,
            read: snapshot,
            write: (data, against) =>
                api.put(
                    `/api/contents/${id}`,
                    { id, data, status: against.status, version: against.version },
                    against.etag ? { headers: { 'If-Match': against.etag } } : undefined,
                ),
        });
    } catch (error) {
        // The tree is the caller here, and it has one answer for all of this: say somebody else
        // moved the page and reload. A collision the shared flow would have asked about is the same
        // event to a tree that holds no unsaved text to protect.
        if (error instanceof SaveConflictError || isConflict(error)) throw new PageChangedError();
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
