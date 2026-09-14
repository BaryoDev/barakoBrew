import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentStatus, type ContentDetailRead } from '@/types/content';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { useSiteEntry, useSaveSite, useApplySiteBlueprint, siteWriteRequest } = await import('./use-site');

const ID = '0b7c1f0e-6d7a-4f3e-9a51-0d1c2b3a4f50';

const SITE_TYPE = { name: 'site', displayName: 'Site', isSingleton: true, fields: [] };
const ARTICLE = { name: 'article', displayName: 'Article', isSingleton: false, fields: [] };

const page = (items: unknown[]) => ({ items, totalItems: items.length, page: 1, pageSize: 2 });

function stored(data: Record<string, unknown>): ContentDetailRead {
    return {
        id: ID,
        contentType: 'site',
        data,
        status: ContentStatus.Published,
        sensitivity: 'Public' as ContentDetailRead['sensitivity'],
        version: 4,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
        etag: '"4"',
    };
}

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.put).mockReset();
});

describe('useSiteEntry', () => {
    it('says the tenant has no site type, and never asks for entries of one', async () => {
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/content-types') return { data: page([ARTICLE]) };
            throw new Error(`unrouted GET ${url}`);
        });

        const { result } = renderHook(() => useSiteEntry(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.kind).toBe('no-type'));
        const urls = vi.mocked(api.get).mock.calls.map(([url]) => url);
        expect(urls).toEqual(['/api/content-types']);
    });

    it('with the type and no entry, says so', async () => {
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/content-types') return { data: page([ARTICLE, SITE_TYPE]) };
            if (url === '/api/contents') return { data: page([]) };
            throw new Error(`unrouted GET ${url}`);
        });

        const { result } = renderHook(() => useSiteEntry(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.kind).toBe('no-entry'));
    });

    it('reads the oldest entry of the site type, with its ETag', async () => {
        const entry = stored({ Name: 'Rotary Club of Koronadal' });
        vi.mocked(api.get).mockImplementation(async (url: string, config?: unknown) => {
            if (url === '/api/content-types') return { data: page([SITE_TYPE]) };
            if (url === '/api/contents') {
                expect(config).toEqual({
                    params: { contentType: 'site', page: 1, pageSize: 2, sortOrder: 'asc' },
                });
                return { data: page([entry]) };
            }
            if (url === `/api/contents/${ID}`) return { data: entry, headers: { etag: '"4"' } };
            throw new Error(`unrouted GET ${url}`);
        });

        const { result } = renderHook(() => useSiteEntry(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.kind).toBe('entry'));
        const state = result.current;
        if (state.kind !== 'entry') throw new Error('unreachable');
        expect(state.entry.data.Name).toBe('Rotary Club of Koronadal');
        expect(state.entry.etag).toBe('"4"');
        expect(state.stored).toBe(1);
    });
});

describe('saving the site entry', () => {
    it('keeps the fields the other screen owns when one screen saves', async () => {
        const entry = stored({
            Name: 'Rotary Club of Koronadal',
            Colors: { accent: '#17458F', gold: '#F7A81B' },
        });
        vi.mocked(api.put).mockResolvedValue({ data: { id: ID, version: 5 } });

        const { result } = renderHook(() => useSaveSite(), { wrapper: wrapper() });
        await act(() =>
            result.current.mutateAsync({ entry, changes: { Colors: { accent: '#1A6B41', gold: '#F7A81B' } } }),
        );

        expect(api.put).toHaveBeenCalledTimes(1);
        const [url, body, config] = vi.mocked(api.put).mock.calls[0];
        expect(url).toBe(`/api/contents/${ID}`);
        expect(body).toEqual({
            id: ID,
            data: { Name: 'Rotary Club of Koronadal', Colors: { accent: '#1A6B41', gold: '#F7A81B' } },
            status: ContentStatus.Published,
            version: 4,
        });
        expect(config).toEqual({ headers: { 'If-Match': '"4"' } });
        expect(api.post).not.toHaveBeenCalled();
    });

    it('creates the entry when there is none, as a draft unless told to publish', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { id: ID, version: 1 } });

        const { result } = renderHook(() => useSaveSite(), { wrapper: wrapper() });
        await act(() => result.current.mutateAsync({ entry: null, changes: { Name: 'baryo.dev' } }));
        await act(() =>
            result.current.mutateAsync({ entry: null, changes: { Name: 'baryo.dev' }, status: ContentStatus.Published }),
        );

        expect(api.post).toHaveBeenCalledTimes(2);
        expect(vi.mocked(api.post).mock.calls[0]).toEqual([
            '/api/contents',
            { contentType: 'site', data: { Name: 'baryo.dev' }, status: ContentStatus.Draft },
        ]);
        expect(vi.mocked(api.post).mock.calls[1][1]).toMatchObject({ status: ContentStatus.Published });
        expect(api.put).not.toHaveBeenCalled();
    });

    it('sends no If-Match when the read carried no ETag, rather than an empty one', () => {
        const request = siteWriteRequest({ entry: { ...stored({}), etag: undefined }, changes: {} });
        expect(request.method).toBe('put');
        expect(request.etag).toBeUndefined();
    });
});

describe('useApplySiteBlueprint', () => {
    it('applies the site blueprint by name', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { blueprint: 'site', created: [] } });

        const { result } = renderHook(() => useApplySiteBlueprint(), { wrapper: wrapper() });
        await act(() => result.current.mutateAsync());

        expect(vi.mocked(api.post).mock.calls).toEqual([['/api/content-types/blueprints/site', {}]]);
    });
});
