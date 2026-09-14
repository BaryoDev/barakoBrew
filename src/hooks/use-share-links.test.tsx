import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { useShareLinks, useCreateShareLink, useRevokeShareLink } = await import('./use-share-links');

function httpError(status: number) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data: {},
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

const LINK = {
    id: 'a1',
    label: 'Client preview',
    createdAt: '2026-09-14T00:00:00Z',
    createdBy: 'admin',
    expiresAt: '2026-10-14T00:00:00Z',
    revokedAt: null,
    lastUsedAt: null,
};

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
});

describe('useShareLinks', () => {
    it('reads the list from a plain array', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: [LINK] });

        const { result } = renderHook(() => useShareLinks(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(api.get).toHaveBeenCalledWith('/api/site/share-links');
        expect(result.current.data).toEqual({ kind: 'links', links: [LINK] });
    });

    it('reads the list from a pagination envelope too', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { items: [LINK, { ...LINK, id: 'b2' }] } });

        const { result } = renderHook(() => useShareLinks(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        const data = result.current.data;
        expect(data?.kind).toBe('links');
        expect(data?.kind === 'links' ? data.links.map((l) => l.id) : []).toEqual(['a1', 'b2']);
    });

    it('turns a 404 into disabled rather than an error', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(404));

        const { result } = renderHook(() => useShareLinks(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ kind: 'disabled' });
    });

    it('leaves any other failure an error', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(500));

        const { result } = renderHook(() => useShareLinks(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.isError).toBe(true));
    });
});

describe('share link mutations', () => {
    it('create posts the label and expiry, returns the key, and reloads the list', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: [] });
        vi.mocked(api.post).mockResolvedValue({ data: { ...LINK, key: 'k-123' } });

        const { result } = renderHook(() => ({ list: useShareLinks(), create: useCreateShareLink() }), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
        expect(api.get).toHaveBeenCalledTimes(1);

        let created: { key: string } | undefined;
        await act(async () => {
            created = await result.current.create.mutateAsync({ label: 'Client preview', expiresAt: '2026-10-14T00:00:00.000Z' });
        });

        expect(api.post).toHaveBeenCalledWith('/api/site/share-links', {
            label: 'Client preview',
            expiresAt: '2026-10-14T00:00:00.000Z',
        });
        expect(created?.key).toBe('k-123');
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    });

    it('revoke deletes by id', async () => {
        vi.mocked(api.delete).mockResolvedValue({ status: 204 });

        const { result } = renderHook(() => useRevokeShareLink(), { wrapper: wrapper() });
        await act(async () => {
            await result.current.mutateAsync('a/1');
        });

        expect(api.delete).toHaveBeenCalledWith('/api/site/share-links/a%2F1');
    });
});
