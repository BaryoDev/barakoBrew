'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { getApiUrl } from '@/lib/api';

export interface Reachability {
    reachable: boolean;
    /** Round trip in milliseconds, null when nothing answered. */
    ms: number | null;
}

/**
 * Whether an HTTP status means the API itself answered.
 *
 * A 502, 503 or 504 is what a proxy says when nothing is behind it, so those three are not the API
 * answering. Anything else is, including a 500 or a 401. The API's own 503 from /health when it is
 * unhealthy looks the same as a proxy's, so it reads as unreachable too, which is the honest side to
 * err on for a sign-in page.
 */
export function isReachableStatus(status: number): boolean {
    return status !== 502 && status !== 503 && status !== 504;
}

/**
 * Whether the API answers, and how fast. The only thing the pre-auth card may know.
 *
 * Plain axios, so a refusal cannot go through the session refresh handler on a page that has no
 * session.
 */
export function useInstanceReachability() {
    return useQuery({
        queryKey: ['instance', 'reachability'],
        queryFn: async (): Promise<Reachability> => {
            const started = performance.now();
            try {
                const response = await axios.get(`${getApiUrl()}/health`, {
                    timeout: 5000,
                    validateStatus: () => true,
                });
                if (!isReachableStatus(response.status)) return { reachable: false, ms: null };
                return { reachable: true, ms: Math.round(performance.now() - started) };
            } catch {
                return { reachable: false, ms: null };
            }
        },
        staleTime: 30_000,
        refetchInterval: 30_000,
        retry: false,
    });
}
