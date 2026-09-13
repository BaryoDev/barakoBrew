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
 * Sends the file as multipart form data.
 *
 * The content type is set explicitly because the shared client defaults to `application/json`, and
 * axios turns a FormData body into JSON when the header says JSON. The API would then find no file
 * and answer "A file is required." In the browser axios drops the header again before sending, so
 * the boundary is filled in.
 */
export async function uploadFile(file: File, isPublic: boolean): Promise<UploadedFile> {
    const form = new FormData();
    form.append('file', file);
    form.append('isPublic', isPublic ? 'true' : 'false');
    const response = await api.post<UploadedFile>('/api/files', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
}

export function useUploadFile() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ file, isPublic }: { file: File; isPublic: boolean }) => uploadFile(file, isPublic),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['files'] }),
    });
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
