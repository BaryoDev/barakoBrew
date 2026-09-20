import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { ContentStatus } from '@/types/content';

/**
 * Saving a reusable block writes the `site` entry, which the Site and Theme screens also write.
 *
 * It is the fourth writer of that one document, and it used to answer a refused write by handing
 * the block editor a failure to show. Now it goes through the same concurrent flow as the other
 * three: an unrelated change somebody else saved in between no longer costs the preset, and two
 * people saving a preset at once is refused rather than one of them quietly winning.
 */
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { usePresets } = await import('./use-presets');
const { SaveConflictError } = await import('@/lib/concurrent-save');

const ID = '0b7c1f0e-6d7a-4f3e-9a51-0d1c2b3a4f50';

const SITE_TYPE = {
    name: 'site',
    displayName: 'Site',
    isSingleton: true,
    fields: [{ name: 'Presets', displayName: 'Presets', type: 'json' }],
};

const PRESET = { type: 'callout', label: 'Callout', fields: [], blocks: [{ type: 'text' }] };

function httpError(status: number) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data: {},
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

let entry: { data: Record<string, unknown>; version: number };

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
    entry = { data: { Name: 'Club', Presets: [] }, version: 4 };

    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types') {
            return { data: { items: [SITE_TYPE], totalItems: 1, page: 1, pageSize: 20 } };
        }
        if (url === '/api/contents') {
            return { data: { items: [{ id: ID }], totalItems: 1, page: 1, pageSize: 2 } };
        }
        if (url === `/api/contents/${ID}`) {
            return {
                data: {
                    id: ID,
                    contentType: 'site',
                    data: entry.data,
                    status: ContentStatus.Published,
                    sensitivity: 'Public',
                    version: entry.version,
                },
                headers: { etag: `"${entry.version}"` },
            };
        }
        throw new Error(`unrouted GET ${url}`);
    });
});

async function readyPresets() {
    const { result } = renderHook(() => usePresets(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.save).not.toBeNull());
    return result;
}

describe('saving a reusable block while somebody else saves the site', () => {
    it('keeps their change to another setting and writes the preset over it', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(httpError(412)).mockResolvedValueOnce({ data: { id: ID, version: 6 } });

        const result = await readyPresets();

        // They rename the site between this read and this write.
        entry = { data: { Name: 'Their new name', Presets: [] }, version: 5 };
        await result.current.save!(PRESET);

        expect(api.put).toHaveBeenCalledTimes(2);
        const sent = vi.mocked(api.put).mock.calls[1][1] as { data: Record<string, unknown>; version: number };
        expect(sent.version).toBe(5);
        expect(sent.data.Name).toBe('Their new name');
        expect(sent.data.Presets).toHaveLength(1);
        expect((sent.data.Presets as { type: string }[])[0].type).toBe('callout');
    });

    it('refuses rather than dropping a preset somebody else saved at the same time', async () => {
        // The second write would succeed if the flow ever retried this, which is the overwrite the
        // assertion below exists to catch.
        vi.mocked(api.put).mockRejectedValueOnce(httpError(412)).mockResolvedValue({ data: { id: ID, version: 6 } });

        const result = await readyPresets();

        entry = { data: { Name: 'Club', Presets: [{ type: 'quote', label: 'Quote', fields: [], blocks: [] }] }, version: 5 };

        await expect(result.current.save!(PRESET)).rejects.toBeInstanceOf(SaveConflictError);
        expect(api.put).toHaveBeenCalledTimes(1);
    });
});
