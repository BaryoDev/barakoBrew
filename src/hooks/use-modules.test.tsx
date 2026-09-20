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
const { useModules, useEnabledModules, useModuleEnabled, readModules, isModuleEnabled } =
    await import('./use-modules');

function httpError(status: number) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data: {},
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

const summary = (name: string, enabled = true) => ({
    name,
    contractVersion: 1,
    enabled,
    schemaState: 'ready',
    schemaChanges: [],
});

function client() {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapper(queryClient = client()) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
});

describe('useModules', () => {
    it('reads the list out of the pagination envelope', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [summary('Files'), summary('Pwa', false)] } });

        const { result } = renderHook(() => useModules(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(api.get).toHaveBeenCalledWith('/api/modules', { params: { page: 1, pageSize: 100 } });
        const data = result.current.data;
        expect(data?.kind).toBe('modules');
        expect(data?.kind === 'modules' ? data.modules.map((m) => m.name) : []).toEqual(['Files', 'Pwa']);
    });

    it('reads a bare array too', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: [summary('Files')] });

        const { result } = renderHook(() => useModules(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ kind: 'modules', modules: [summary('Files')] });
    });

    it('treats a 403 as the API refusing to say, not as an error', async () => {
        // The endpoint needs SuperAdmin or Admin. An Accountant learns nothing and must keep the
        // rail it had, so this is an answer rather than a failure.
        vi.mocked(api.get).mockRejectedValue(httpError(403));

        const { result } = renderHook(() => useModules(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ kind: 'unreadable' });
    });

    it('treats a 404 as the API refusing to say', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(404));

        const { result } = renderHook(() => useModules(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ kind: 'unreadable' });
    });

    it('reads an empty list as a deployment that runs no modules', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [] } });

        const { result } = renderHook(() => useModules(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ kind: 'modules', modules: [] });
    });

    it('does not read a response that is not a module list as a deployment with no modules', async () => {
        // The difference matters: an empty list hides every module item in the rail, and a response
        // nobody recognises must leave the rail alone instead.
        vi.mocked(api.get).mockResolvedValue({ data: { id: 'something-else', version: 1 } });

        const { result } = renderHook(() => useModules(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ kind: 'unreadable' });
    });

    it('does not read rows that are not modules', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [{ id: 'a' }, { id: 'b' }] } });

        const { result } = renderHook(() => useModules(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ kind: 'unreadable' });
    });

    it('leaves any other failure an error', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(500));

        const { result } = renderHook(() => useModules(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isError).toBe(true));
    });
});

describe('what the caller is told', () => {
    it('lists only the modules the deployment runs', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { items: [summary('Files'), summary('Accounting', false), summary('Pwa')] },
        });

        const { result } = renderHook(() => useEnabledModules(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current).toBeDefined());
        expect(result.current).toEqual(['Files', 'Pwa']);
    });

    it('says nothing at all while the request is in flight', () => {
        vi.mocked(api.get).mockReturnValue(new Promise(() => {}));

        const { result } = renderHook(() => useEnabledModules(), { wrapper: wrapper() });

        expect(result.current).toBeUndefined();
    });

    it('says nothing at all when the API would not answer', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(403));

        const { result } = renderHook(
            () => ({ modules: useEnabledModules(), files: useModuleEnabled('Files') }),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(api.get).toHaveBeenCalled());
        expect(result.current.modules).toBeUndefined();
        // Not false. Undefined is the caller's cue to keep doing what it did before.
        expect(result.current.files).toBeUndefined();
    });

    it('answers true and false once the API has spoken', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [summary('Files'), summary('Pwa', false)] } });

        const { result } = renderHook(
            () => ({ files: useModuleEnabled('Files'), pwa: useModuleEnabled('Pwa'), gone: useModuleEnabled('Accounting') }),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(result.current.files).toBe(true));
        // Installed and switched off, and not installed at all, are both "not served here".
        expect(result.current.pwa).toBe(false);
        expect(result.current.gone).toBe(false);
    });
});

describe('readModules', () => {
    it('fetches once and serves the cache after that', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [summary('Pages')] } });
        const queryClient = client();

        const first = await readModules(queryClient);
        const second = await readModules(queryClient);

        expect(api.get).toHaveBeenCalledTimes(1);
        expect(isModuleEnabled(first, 'Pages')).toBe(true);
        expect(isModuleEnabled(second, 'Pages')).toBe(true);
    });

    it('reports unreadable rather than throwing when the request fails', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(500));

        const report = await readModules(client());

        expect(report).toEqual({ kind: 'unreadable' });
        expect(isModuleEnabled(report, 'Pages')).toBeUndefined();
    });
});
