import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { useCreateApiKey } = await import('./use-api-keys');
const { useMfaSetup, useMfaEnable } = await import('./use-mfa');
const { useCreateShareLink } = await import('./use-share-links');
const { siteShareScope } = await import('@/lib/site-mode');

/**
 * The rule in `@/lib/secrets`: a mutation that returns a secret keeps it only while something
 * observes it. Before `gcTime: 0` each of these held the secret in the mutation cache for five
 * minutes after the screen that showed it had gone.
 */
const CASES: {
    name: string;
    secret: string;
    response: unknown;
    use: () => UseMutationResult<unknown, Error, never, unknown>;
    variables: unknown;
}[] = [
    {
        name: 'the created API key',
        secret: 'bcms_FULLSECRET',
        response: { id: 'k1', name: 'CI', prefix: 'bcms_ab12', scopes: ['content:read'], key: 'bcms_FULLSECRET' },
        use: () => useCreateApiKey() as never,
        variables: { name: 'CI', scopes: ['content:read'] },
    },
    {
        name: 'the MFA setup secret',
        secret: 'JBSWY3DPEHPK3PXP',
        response: { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/a?secret=JBSWY3DPEHPK3PXP' },
        use: () => useMfaSetup() as never,
        variables: undefined,
    },
    {
        name: 'the MFA recovery codes',
        secret: 'aaaa-bbbb',
        response: { message: 'on', recoveryCodes: ['aaaa-bbbb', 'cccc-dddd'] },
        use: () => useMfaEnable() as never,
        variables: '123456',
    },
    {
        name: 'the share link key',
        secret: 'share-KEY-1',
        response: { id: 'l1', label: 'Preview', createdAt: '2026-09-14T00:00:00Z', key: 'share-KEY-1' },
        use: () => useCreateShareLink(siteShareScope('https://example.com')) as never,
        variables: { label: 'Preview' },
    },
];

function client() {
    return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function cacheHolds(qc: QueryClient, secret: string) {
    const mutations = qc
        .getMutationCache()
        .getAll()
        .some((m) => JSON.stringify(m.state.data ?? null).includes(secret));
    const queries = qc
        .getQueryCache()
        .getAll()
        .some((q) => JSON.stringify(q.state.data ?? null).includes(secret));
    return { mutations, queries };
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.get).mockResolvedValue({ data: { items: [] } });
});

describe.each(CASES)('$name', ({ secret, response, use, variables }) => {
    function run() {
        vi.mocked(api.post).mockResolvedValue({ data: response });
        const qc = client();
        const rendered = renderHook(() => use(), {
            wrapper: ({ children }: { children: ReactNode }) => (
                <QueryClientProvider client={qc}>{children}</QueryClientProvider>
            ),
        });
        return { qc, ...rendered };
    }

    it('is in the mutation cache while the screen is showing it, and gone once it is reset', async () => {
        const { qc, result } = run();

        await act(async () => {
            await result.current.mutateAsync(variables as never);
        });

        expect(qc.getMutationCache().getAll()).toHaveLength(1);
        expect(cacheHolds(qc, secret).mutations).toBe(true);

        act(() => result.current.reset());

        await waitFor(() => expect(cacheHolds(qc, secret).mutations).toBe(false));
    });

    it('is gone from the mutation cache when the screen unmounts', async () => {
        const { qc, result, unmount } = run();

        await act(async () => {
            await result.current.mutateAsync(variables as never);
        });
        expect(cacheHolds(qc, secret).mutations).toBe(true);

        unmount();

        await waitFor(() => expect(cacheHolds(qc, secret).mutations).toBe(false));
    });

    it('is never written to the query cache', async () => {
        const { qc, result } = run();

        await act(async () => {
            await result.current.mutateAsync(variables as never);
        });

        expect(qc.getQueryCache().getAll().length + qc.getMutationCache().getAll().length).toBeGreaterThan(0);
        expect(cacheHolds(qc, secret).queries).toBe(false);
    });
});
