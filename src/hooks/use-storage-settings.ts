import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
    StorageSettings,
    StorageSettingsRequest,
    StorageTestResult,
} from '@/types/storage-settings';

const KEY = ['settings', 'storage'] as const;

export function useStorageSettings() {
    return useQuery({
        queryKey: KEY,
        queryFn: async () => {
            const response = await api.get<StorageSettings>('/api/settings/storage');
            return response.data;
        },
    });
}

export function useSaveStorageSettings() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: StorageSettingsRequest) => {
            const response = await api.put<StorageSettings>('/api/settings/storage', data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: KEY });
        },
    });
}

/** Posts the values on the form without saving them. A secret left out is taken from the stored one. */
export function useTestStorageSettings() {
    return useMutation({
        mutationFn: async (data: StorageSettingsRequest) => {
            const response = await api.post<StorageTestResult>('/api/settings/storage/test', data);
            return response.data;
        },
    });
}
