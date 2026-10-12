import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const { api, isResponseShapeError } = await import('@/lib/api');
const { useContentHistory } = await import('./use-contents');

const ID = '0b7a5b8e-7a57-4d38-9d0e-2f1f0f0c5a11';

/** Two entries as Features/Content/History writes them, nulls and all. */
const CREATED = {
    id: ID,
    changeType: 'Created',
    data: { Title: 'First' },
    lastModifiedBy: '00000000-0000-0000-0000-000000000001',
    versionId: 'v1',
    timestamp: '2026-09-01T00:00:00+00:00',
    status: 'Draft',
    scheduledPublishAt: null,
    scheduledUnpublishAt: null,
    scheduledSensitivity: null,
    scheduledSensitivityAt: null,
    sensitivity: 'Public',
};
const PUBLISHED = { ...CREATED, changeType: 'StatusChanged', data: null, versionId: 'v2', status: 'Published', sensitivity: null };

const envelope = (items: unknown[]) => ({
    items,
    page: 1,
    pageSize: 20,
    totalItems: items.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
});

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useContentHistory', () => {
    it('reads the entries out of the envelope the API sends', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: envelope([CREATED, PUBLISHED]) });

        const { result } = renderHook(() => useContentHistory(ID), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toHaveLength(2);
        expect(result.current.data?.map((v) => v.versionId)).toEqual(['v1', 'v2']);
    });

    it('fails on the old versions body instead of reading it as an empty history', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { versions: [CREATED, PUBLISHED] } });

        const { result } = renderHook(() => useContentHistory(ID), { wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(isResponseShapeError(result.current.error)).toBe(true);
        expect(result.current.data).toBeUndefined();
    });

    it('fails on a status sent as a number, the way the API sent it before 4.0', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: envelope([{ ...CREATED, status: 0 }]) });

        const { result } = renderHook(() => useContentHistory(ID), { wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(isResponseShapeError(result.current.error)).toBe(true);
    });
});
