import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

/**
 * Switching tenant swaps the token, and every cached answer was fetched under the old one. Marking
 * those stale is not enough: detail and history keys carry no tenant, so the old tenant's entry is
 * still what a screen reads until its refetch lands.
 */

const { api, tokenStore, tenantOfToken } = await import('@/lib/api');
const { useSwitchTenant } = await import('./use-tenants');

const originalAdapter = api.defaults.adapter;

function jwt(tenant: string): string {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
    const payload = { UserId: 'u1', Username: 'admin', tenant, exp: Math.floor(Date.now() / 1000) + 900 };
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.sig`;
}

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
    client = new QueryClient();
    tokenStore.set(jwt('acme'));
    api.defaults.adapter = async (config) => ({
        status: 200,
        statusText: '200',
        headers: {},
        config,
        data: { token: jwt('globex') },
    });
});

afterEach(() => {
    api.defaults.adapter = originalAdapter;
    tokenStore.clear();
});

describe('useSwitchTenant', () => {
    it('drops cached answers fetched under the previous tenant', async () => {
        client.setQueryData(['contents', 'detail', 'post', '1'], { title: 'Acme only' });
        client.setQueryData(['contents', 'history', 'post', '1'], { items: [{ version: 1 }] });
        expect(client.getQueryCache().getAll()).toHaveLength(2);

        const { result } = renderHook(() => useSwitchTenant(), { wrapper });
        await act(async () => {
            await result.current.mutateAsync('globex');
        });

        expect(client.getQueryData(['contents', 'detail', 'post', '1'])).toBeUndefined();
        expect(client.getQueryData(['contents', 'history', 'post', '1'])).toBeUndefined();
    });

    it('refetches a mounted screen under the new tenant instead of leaving the old entry', async () => {
        const key = ['contents', 'detail', 'post', '1'];
        const screen = renderHook(
            () => useQuery({ queryKey: key, queryFn: async () => `entry of ${tenantOfToken(tokenStore.token)}` }),
            { wrapper },
        );
        await waitFor(() => expect(screen.result.current.data).toBe('entry of acme'));

        const { result } = renderHook(() => useSwitchTenant(), { wrapper });
        await act(async () => {
            await result.current.mutateAsync('globex');
        });

        await waitFor(() => expect(screen.result.current.data).toBe('entry of globex'));
    });

    it('shows no data for a mounted screen while its refetch is pending', async () => {
        const key = ['contents', 'detail', 'post', '1'];
        let release: (value: string) => void = () => {};
        let calls = 0;
        const screen = renderHook(
            () =>
                useQuery({
                    queryKey: key,
                    queryFn: () => {
                        calls += 1;
                        if (calls === 1) return Promise.resolve('entry of acme');
                        return new Promise<string>((resolve) => {
                            release = resolve;
                        });
                    },
                }),
            { wrapper },
        );
        await waitFor(() => expect(screen.result.current.data).toBe('entry of acme'));

        const { result } = renderHook(() => useSwitchTenant(), { wrapper });
        act(() => {
            result.current.mutate('globex');
        });

        await waitFor(() => expect(calls).toBe(2));
        expect(screen.result.current.fetchStatus).toBe('fetching');
        expect(screen.result.current.data).toBeUndefined();

        await act(async () => {
            release('entry of globex');
        });
        await waitFor(() => expect(screen.result.current.data).toBe('entry of globex'));
    });
});
