import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';

const get = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

const { useSignInMethods } = await import('./use-sign-in-methods');

function wrapper() {
    const client = new QueryClient();
    function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    return Wrapper;
}

function failure(status: number) {
    const error = new AxiosError('failed');
    error.response = { status, data: {}, statusText: '', headers: {}, config: {} as never };
    return error;
}

describe('useSignInMethods', () => {
    beforeEach(() => get.mockReset());

    it('takes the list the server gives', async () => {
        get.mockResolvedValue({ data: { methods: ['password'] } });
        const { result } = renderHook(() => useSignInMethods(), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.data).toEqual(['password']));
    });

    it('uses the two defaults on a 404, an API that predates the endpoint', async () => {
        get.mockRejectedValue(failure(404));
        const { result } = renderHook(() => useSignInMethods(), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.data).toEqual(['password', 'email-code']));
        expect(get).toHaveBeenCalledTimes(1);
    });

    it('uses the two defaults when the reply is not a list', async () => {
        get.mockResolvedValue({ data: { methods: 'password' } });
        const { result } = renderHook(() => useSignInMethods(), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.data).toEqual(['password', 'email-code']));
    });

    it('retries a 500 and then reports an error instead of caching the defaults', async () => {
        get.mockRejectedValue(failure(500));
        const { result } = renderHook(() => useSignInMethods(), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });
        expect(get.mock.calls.length).toBeGreaterThan(1);
        expect(result.current.data).toBeUndefined();
    });
});
