'use client';

import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import { DEFAULT_METHOD_IDS, readMethodIds } from '@/lib/sign-in-methods';

/**
 * The method ids this instance offers, from the anonymous `GET /api/auth/methods`.
 *
 * An API that predates the endpoint answers 404, and one that answers with something that is not the
 * documented list is no better: both read as the two methods the console always drew, so a default
 * stays what happens today, and that answer is cached because it will not change until the API does.
 *
 * Any other failure (a network error, a 500, a proxy's 502) is not an answer. It is retried a little
 * and, if it persists, left as an error for the page to draw a fallback from without caching it, so
 * the next visit asks again rather than remembering a guess.
 */
export function useSignInMethods() {
    return useQuery({
        queryKey: ['auth', 'methods'],
        queryFn: async (): Promise<string[]> => {
            try {
                const { data } = await api.get<unknown>('/api/auth/methods');
                return readMethodIds(data) ?? [...DEFAULT_METHOD_IDS];
            } catch (error) {
                if (isAxiosError(error) && error.response?.status === 404) return [...DEFAULT_METHOD_IDS];
                throw error;
            }
        },
        staleTime: Infinity,
        retry: 2,
        retryDelay: 300,
    });
}
