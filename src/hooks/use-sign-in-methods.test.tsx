import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';

// A plain function, not vi.fn(): vitest's spy tracks the promise a mock returns, and for a rejected
// one that surfaces as a second, unhandled copy of the error on the test even though the hook
// caught it. What matters here is how many times the hook asked, so count by hand.
let calls = 0;
let reply: () => Promise<unknown> = async () => ({ data: {} });
vi.mock('@/lib/api', () => ({
    api: {
        get: () => {
            calls += 1;
            return reply();
        },
    },
}));

const { useSignInMethods } = await import('./use-sign-in-methods');

function wrapper() {
    const client = new QueryClient();
    function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    return Wrapper;
}

function failure(status: number) {
    return new AxiosError('failed', undefined, undefined, undefined, {
        status,
        data: {},
        statusText: '',
        headers: {},
        config: {} as never,
    });
}

describe('useSignInMethods', () => {
    beforeEach(() => {
        calls = 0;
    });

    it('takes the list the server gives', async () => {
        reply = async () => ({ data: { methods: ['password'] } });
        const { result } = renderHook(() => useSignInMethods(), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.data).toEqual(['password']));
    });

    it('uses the two defaults on a 404, an API that predates the endpoint', async () => {
        reply = () => Promise.reject(failure(404));
        const { result } = renderHook(() => useSignInMethods(), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.data).toEqual(['password', 'email-code']));
        expect(calls).toBe(1);
    });

    it('uses the two defaults when the reply is not a list', async () => {
        reply = async () => ({ data: { methods: 'password' } });
        const { result } = renderHook(() => useSignInMethods(), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.data).toEqual(['password', 'email-code']));
    });

    it('retries a 500 and then reports an error instead of caching the defaults', async () => {
        reply = () => Promise.reject(failure(500));
        const { result } = renderHook(() => useSignInMethods(), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });
        expect(calls).toBeGreaterThan(1);
        expect(result.current.data).toBeUndefined();
    });
});
