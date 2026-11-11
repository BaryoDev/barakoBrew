'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchModulePackages } from '@/lib/nuget';

export const NUGET_MODULES_KEY = ['nuget', 'barakocms-module'] as const;

/**
 * Packages under the `barakocms-module` tag, read from nuget.org by the browser. Off until the
 * Browse view is opened, so the All modules page makes no third-party call. A failure is an answer
 * the view shows as "unavailable", not an error to retry in a loop.
 */
export function useNugetModules(enabled: boolean) {
    return useQuery({
        queryKey: NUGET_MODULES_KEY,
        queryFn: ({ signal }) => fetchModulePackages(fetch, signal),
        enabled,
        retry: false,
        staleTime: 10 * 60 * 1000,
    });
}
