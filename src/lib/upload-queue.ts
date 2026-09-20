/**
 * The upload queue behind the progress tray.
 *
 * Plain TypeScript with a subscribe/snapshot pair rather than React state, so the console can hand
 * a file over and walk away: the queue outlives the dialog that started the upload and every screen
 * the operator visits while it runs.
 */

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed';

export interface UploadJob {
    id: string;
    fileName: string;
    size: number;
    isPublic: boolean;
    status: UploadStatus;
    /** Bytes sent over bytes to send, 0 to 1. */
    progress: number;
    /** The reason the API gave, on a failed job. */
    error: string | null;
}

export interface UploadRequest {
    file: File;
    isPublic: boolean;
}

export type SendUpload = (request: UploadRequest, onProgress: (progress: number) => void) => Promise<unknown>;

/**
 * Two at a time. A browser will open six connections to the same origin, and a batch of large
 * images sent all at once saturates an upstream link and can trip the API's request limits.
 */
export const MAX_CONCURRENT_UPLOADS = 2;

export class UploadQueue {
    private jobs: UploadJob[] = [];
    private requests = new Map<string, UploadRequest>();
    private listeners = new Set<() => void>();
    private running = 0;
    private counter = 0;

    constructor(
        private readonly send: SendUpload,
        private readonly options: { concurrency?: number; onUploaded?: (job: UploadJob) => void } = {},
    ) {}

    /** The current rows. A new array on every change, so `useSyncExternalStore` sees one. */
    readonly getSnapshot = (): readonly UploadJob[] => this.jobs;

    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    /** Anything still queued or in flight, which is what a page leaving would kill. */
    get isBusy(): boolean {
        return this.jobs.some((job) => job.status === 'queued' || job.status === 'uploading');
    }

    add(requests: readonly UploadRequest[]): UploadJob[] {
        const added = requests.map((request) => {
            const id = `u${++this.counter}`;
            this.requests.set(id, request);
            return {
                id,
                fileName: request.file.name,
                size: request.file.size,
                isPublic: request.isPublic,
                status: 'queued' as const,
                progress: 0,
                error: null,
            };
        });
        this.jobs = [...this.jobs, ...added];
        this.changed();
        this.pump();
        return added;
    }

    retry(id: string): void {
        const job = this.jobs.find((candidate) => candidate.id === id);
        if (!job || job.status !== 'failed' || !this.requests.has(id)) return;
        this.update(id, { status: 'queued', progress: 0, error: null });
        this.pump();
    }

    /** Takes a finished or failed row off the tray. An upload in flight is left alone. */
    dismiss(id: string): void {
        const job = this.jobs.find((candidate) => candidate.id === id);
        if (!job || job.status === 'uploading' || job.status === 'queued') return;
        this.requests.delete(id);
        this.jobs = this.jobs.filter((candidate) => candidate.id !== id);
        this.changed();
    }

    clearFinished(): void {
        for (const job of this.jobs) {
            if (job.status === 'done' || job.status === 'failed') this.requests.delete(job.id);
        }
        this.jobs = this.jobs.filter((job) => job.status === 'queued' || job.status === 'uploading');
        this.changed();
    }

    private pump(): void {
        const limit = this.options.concurrency ?? MAX_CONCURRENT_UPLOADS;
        while (this.running < limit) {
            const next = this.jobs.find((job) => job.status === 'queued');
            if (!next) return;
            this.start(next.id);
        }
    }

    private start(id: string): void {
        const request = this.requests.get(id);
        if (!request) return;
        this.running += 1;
        this.update(id, { status: 'uploading', progress: 0, error: null });

        this.send(request, (progress) => {
            const job = this.jobs.find((candidate) => candidate.id === id);
            if (job?.status !== 'uploading') return;
            this.update(id, { progress: Math.min(1, Math.max(0, progress)) });
        }).then(
            () => {
                this.update(id, { status: 'done', progress: 1 });
                this.requests.delete(id);
                const done = this.jobs.find((candidate) => candidate.id === id);
                if (done) this.options.onUploaded?.(done);
                this.finish();
            },
            (error: unknown) => {
                this.update(id, {
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'The upload failed.',
                });
                this.finish();
            },
        );
    }

    private finish(): void {
        this.running -= 1;
        this.pump();
    }

    private update(id: string, patch: Partial<UploadJob>): void {
        this.jobs = this.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job));
        this.changed();
    }

    private changed(): void {
        for (const listener of this.listeners) listener();
    }
}
