'use client';

import { useQuery } from '@tanstack/react-query';
import { api, isForbidden, isNotFound } from '@/lib/api';
import type { ModuleConfiguration } from '@/types/modules';

/**
 * What a module runs with, or `unavailable` when the caller may not read it (403, it needs
 * view_module_configuration) or the API has no such route or module (404). Neither is an error to
 * show; the card says it cannot be shown.
 */
export type ModuleConfigurationResult =
    | { kind: 'unavailable' }
    | { kind: 'configuration'; configuration: ModuleConfiguration };

export function useModuleConfiguration(name: string, enabled = true) {
    return useQuery({
        queryKey: ['modules', name, 'configuration'],
        enabled,
        retry: false,
        queryFn: async (): Promise<ModuleConfigurationResult> => {
            try {
                const { data } = await api.get<ModuleConfiguration>(
                    `/api/modules/${encodeURIComponent(name)}/configuration`,
                );
                return { kind: 'configuration', configuration: data };
            } catch (error) {
                if (isForbidden(error) || isNotFound(error)) return { kind: 'unavailable' };
                throw error;
            }
        },
    });
}
