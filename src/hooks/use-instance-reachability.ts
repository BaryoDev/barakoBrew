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
 * Whether the API answers, and how fast. The only thing the pre-auth card may know.
 *
 * Any HTTP answer counts as reachable, including a 503 from an unhealthy instance: the question is
 * whether the console can talk to it, not whether it is well. Plain axios, so a refusal cannot go
 * through the session refresh handler on a page that has no session.
 */
export function useInstanceReachability() {
    return useQuery({
        queryKey: ['instance', 'reachability'],
        queryFn: async (): Promise<Reachability> => {
            const started = performance.now();
            try {
                await axios.get(`${getApiUrl()}/health`, { timeout: 5000, validateStatus: () => true });
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
