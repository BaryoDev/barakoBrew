'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DEFAULT_METHOD_IDS, readMethodIds } from '@/lib/sign-in-methods';

/**
 * The method ids this instance offers, from the anonymous `GET /api/auth/methods`.
 *
 * An API that predates the endpoint answers 404, and a flaky network answers nothing. Both read as
 * the two methods the console always drew, so a default stays what happens today. A well-formed
 * reply is taken as given, even when it is short: an instance that lists only `email-code` really
 * does not take passwords.
 */
export function useSignInMethods() {
    return useQuery({
        queryKey: ['auth', 'methods'],
        queryFn: async (): Promise<string[]> => {
            try {
                const { data } = await api.get<unknown>('/api/auth/methods');
                return readMethodIds(data) ?? [...DEFAULT_METHOD_IDS];
            } catch {
                return [...DEFAULT_METHOD_IDS];
            }
        },
        staleTime: Infinity,
        retry: false,
    });
}
