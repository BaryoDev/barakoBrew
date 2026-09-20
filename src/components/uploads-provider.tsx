'use client';

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '@/lib/api';
import { uploadFile } from '@/hooks/use-files';
import { UploadQueue, type UploadJob, type UploadRequest } from '@/lib/upload-queue';

interface Uploads {
    jobs: readonly UploadJob[];
    /** Hands files to the queue and returns at once. The caller can close whatever it was in. */
    add: (requests: readonly UploadRequest[]) => void;
    retry: (id: string) => void;
    dismiss: (id: string) => void;
    clearFinished: () => void;
    busy: boolean;
}

const UploadsContext = createContext<Uploads | null>(null);

/**
 * The queue every upload goes through, and the reason the upload dialog can close on Upload.
 *
 * It lives above the routes so navigating does not cancel an upload in flight. Closing or reloading
 * the tab still does, which is what the beforeunload prompt is for: an XHR dies with its page.
 */
export function UploadsProvider({ children }: { children: React.ReactNode }) {
    const queryClient = useQueryClient();

    const queue = useMemo(
        () =>
            new UploadQueue(
                async ({ file, isPublic }, onProgress) => {
                    try {
                        return await uploadFile(file, isPublic, { onProgress });
                    } catch (error) {
                        // The tray shows one line per file, so the API's reason has to travel with
                        // the rejection rather than be read off a shared mutation.
                        throw new Error(apiErrorMessage(error, 'The upload failed.'));
                    }
                },
                { onUploaded: () => queryClient.invalidateQueries({ queryKey: ['files'] }) },
            ),
        [queryClient],
    );

    const jobs = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
    const busy = jobs.some((job) => job.status === 'queued' || job.status === 'uploading');

    useEffect(() => {
        if (!busy) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [busy]);

    // The actions keep their identity across renders, so an effect that registers a drop handler
    // with `add` in its dependencies does not re-register on every progress tick.
    const actions = useMemo(
        () => ({
            add: (requests: readonly UploadRequest[]) => queue.add(requests),
            retry: (id: string) => queue.retry(id),
            dismiss: (id: string) => queue.dismiss(id),
            clearFinished: () => queue.clearFinished(),
        }),
        [queue],
    );

    const value = useMemo<Uploads>(() => ({ ...actions, jobs, busy }), [actions, jobs, busy]);

    return <UploadsContext.Provider value={value}>{children}</UploadsContext.Provider>;
}

export function useUploads(): Uploads {
    const uploads = useContext(UploadsContext);
    if (!uploads) throw new Error('useUploads needs an UploadsProvider above it.');
    return uploads;
}
