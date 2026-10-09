import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});

vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: { userId: 'u1', username: 'r', roles: ['Registrar'] } }),
}));

const { api, tokenStore } = await import('@/lib/api');
const { useAccess } = await import('./use-access');

/** A token the console can read claims from. Unsigned, which nothing here checks. */
function token(claims: Record<string, unknown>): string {
    const part = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
    return `${part({ alg: 'none' })}.${part(claims)}.x`;
}

function answer(capabilities: string[]) {
    return { data: { userId: 'u1', username: 'r', tenant: 'north', roles: [{ id: 'r-1', name: 'Registrar' }], capabilities } };
}

function renderAccess() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderHook(() => useAccess(), {
        wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    act(() => tokenStore.set(token({ tenant: 'north', jti: 'a' })));
});

describe('useAccess', () => {
    it('reads /api/me again when the token is refreshed, so a revoked capability stops being offered', async () => {
        vi.mocked(api.get).mockResolvedValueOnce(answer(['upload_files'])).mockResolvedValueOnce(answer([]));
        const { result } = renderAccess();
        await waitFor(() => expect(result.current.can('upload_files')).toBe(true));

        act(() => tokenStore.set(token({ tenant: 'north', jti: 'b' })));

        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(result.current.can('upload_files')).toBe(false));
        expect(result.current.known).toBe(true);
    });

    it('keeps the last answer while the next token loads, rather than falling back to role names', async () => {
        let release: (value: unknown) => void = () => {};
        vi.mocked(api.get)
            .mockResolvedValueOnce(answer(['upload_files']))
            .mockReturnValueOnce(new Promise((resolve) => (release = resolve)) as never);
        const { result } = renderAccess();
        await waitFor(() => expect(result.current.known).toBe(true));

        act(() => tokenStore.set(token({ tenant: 'north', jti: 'b' })));
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
        expect(result.current.known).toBe(true);
        expect(result.current.can('upload_files')).toBe(true);

        await act(async () => release(answer([])));
        await waitFor(() => expect(result.current.can('upload_files')).toBe(false));
    });

    it('does not carry one tenant’s answer into another while it loads', async () => {
        vi.mocked(api.get)
            .mockResolvedValueOnce(answer(['upload_files']))
            .mockReturnValueOnce(new Promise(() => {}) as never);
        const { result } = renderAccess();
        await waitFor(() => expect(result.current.known).toBe(true));

        act(() => tokenStore.set(token({ tenant: 'south', jti: 'c' })));
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
        expect(result.current.known).toBe(false);
    });
});
