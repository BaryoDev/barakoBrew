import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { usePageTree } = await import('./use-pages');

function httpError(status: number) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data: {},
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

const entry = (name: string, enabled: boolean) => ({
    name,
    contractVersion: 1,
    enabled,
    schemaState: 'ready',
    schemaChanges: [],
});

/** Answers /api/modules with the given inventory, and the tree endpoint with an empty tree. */
function serve(modules: unknown) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/modules') {
            if (modules instanceof Error) throw modules;
            return { data: modules };
        }
        if (url === '/api/pages/tree') return { data: { contract: 1, items: [], options: {} } };
        throw new Error(`unexpected request to ${url}`);
    });
}

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

const calledUrls = () => vi.mocked(api.get).mock.calls.map((c) => c[0]);

beforeEach(() => {
    vi.mocked(api.get).mockReset();
});

describe('usePageTree', () => {
    /**
     * The point of the change. Before it, the hook called the tree endpoint and read whatever came
     * back, so a deployment without Pages was only discovered when something answered 404.
     */
    it('learns the module is off from the module list, without calling the tree endpoint', async () => {
        serve({ items: [entry('Pages', false), entry('Files', true)] });

        const { result } = renderHook(() => usePageTree(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ kind: 'disabled' });
        expect(calledUrls()).toContain('/api/modules');
        expect(calledUrls()).not.toContain('/api/pages/tree');
    });

    it('learns it is off from a module the API does not list at all', async () => {
        serve({ items: [entry('Files', true)] });

        const { result } = renderHook(() => usePageTree(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ kind: 'disabled' });
        expect(calledUrls()).not.toContain('/api/pages/tree');
    });

    it('reads the tree when the API says the module runs', async () => {
        serve({ items: [entry('Pages', true)] });

        const { result } = renderHook(() => usePageTree(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.kind).not.toBe('disabled');
        expect(calledUrls()).toContain('/api/pages/tree');
    });

    // The fallback the issue asked to keep. A caller who may not read /api/modules gets a 403 there
    // and has nothing but the 404 to go on, which is exactly the behaviour this screen had before.
    it('falls back to the 404 when the module list is not readable', async () => {
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/modules') throw httpError(403);
            throw httpError(404);
        });

        const { result } = renderHook(() => usePageTree(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ kind: 'disabled' });
        expect(calledUrls()).toContain('/api/pages/tree');
    });

    it('still errors on a failure that says nothing about the module', async () => {
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/modules') throw httpError(403);
            throw httpError(500);
        });

        const { result } = renderHook(() => usePageTree(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.data).toBeUndefined();
    });
});
