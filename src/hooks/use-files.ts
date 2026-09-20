'use client';

import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';

/** `FileMetadata` in BarakoCMS.Files, as the list answers with it. */
export interface StoredFile {
    id: string;
    fileName: string;
    contentType: string;
    size: number;
    isPublic: boolean;
    publicUrl: string | null;
    alt: string | null;
    caption: string | null;
    uploadedBy: string;
    createdAt: string;
}

/** What `POST /api/files` answers with. Narrower than the list row. */
export interface UploadedFile {
    id: string;
    fileName: string;
    contentType: string;
    size: number;
    isPublic: boolean;
    publicUrl: string | null;
}

export interface FileUsageRow {
    id: string;
    contentType: string;
    title: string | null;
    status: string;
}

/** The body of the 409 a delete answers while entries still reference the file. */
export interface DeleteRefusal {
    message: string;
    total: number;
    usages: FileUsageRow[];
}

export const FILES_PAGE_SIZE = 20;

export function useFiles(page: number) {
    return useQuery({
        queryKey: ['files', 'list', page],
        queryFn: async () =>
            (
                await api.get<Paginated<StoredFile>>('/api/files', {
                    params: { page, pageSize: FILES_PAGE_SIZE },
                })
            ).data,
    });
}

/**
 * Sends the file as multipart form data. The shared client drops its JSON default for a form.
 *
 * `onProgress` reports bytes sent over bytes to send, 0 to 1. A request with no `total` (a proxy
 * that drops the length) reports nothing rather than guessing, so the bar stays where it was.
 */
export async function uploadFile(
    file: File,
    isPublic: boolean,
    options: { onProgress?: (progress: number) => void } = {},
): Promise<UploadedFile> {
    const form = new FormData();
    form.append('file', file);
    form.append('isPublic', isPublic ? 'true' : 'false');
    const { onProgress } = options;
    const response = await api.post<UploadedFile>('/api/files', form, {
        onUploadProgress: onProgress
            ? (event) => {
                  const total = event.total ?? 0;
                  if (total > 0) onProgress(event.loaded / total);
              }
            : undefined,
    });
    return response.data;
}

export function useDeleteFile() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, force = false }: { id: string; force?: boolean }) => {
            await api.delete(`/api/files/${id}`, { params: force ? { force: true } : undefined });
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['files'] }),
    });
}

/** The refusal body when a delete was blocked by entries using the file, otherwise null. */
export function deleteRefusal(error: unknown): DeleteRefusal | null {
    if (!axios.isAxiosError(error) || error.response?.status !== 409) return null;
    const data = error.response.data as Partial<DeleteRefusal> | undefined;
    if (typeof data?.total !== 'number') return null;
    return { message: data.message ?? '', total: data.total, usages: data.usages ?? [] };
}

export function isForbidden(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 403;
}

/**
 * The bytes behind an authenticated file URL, fetched through the shared client so the bearer rides
 * in a header. Cached by URL, so a remount or a return to the same page does not download it again.
 */
export function useFileBlob(url: string) {
    return useQuery({
        queryKey: ['files', 'blob', url],
        queryFn: async () => (await api.get<Blob>(url, { responseType: 'blob' })).data,
        staleTime: Infinity,
    });
}
