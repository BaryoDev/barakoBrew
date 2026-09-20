'use client';

import { useUploads } from '@/components/uploads-provider';
import { formatBytes } from '@/lib/files';
import { Button } from '@/components/ui/button';
import { IconCheckCircle, IconRefresh, IconTimes, IconTimesCircle } from '@/components/icons';
import type { UploadJob } from '@/lib/upload-queue';

const META = 'text-muted-foreground font-mono text-[11px] tabular-nums';

function percent(job: UploadJob): number {
    return Math.round(job.progress * 100);
}

function Row({ job }: { job: UploadJob }) {
    const { retry, dismiss } = useUploads();
    const done = job.status === 'done';
    const failed = job.status === 'failed';

    return (
        <li className="space-y-1.5 px-3 py-2.5">
            <div className="flex items-center gap-2">
                {done && <IconCheckCircle className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />}
                {failed && <IconTimesCircle className="text-destructive size-3.5 shrink-0" aria-hidden="true" />}
                <span className="truncate text-[13px] font-semibold">{job.fileName}</span>
                <span className={`${META} ml-auto shrink-0`}>
                    {job.status === 'uploading' ? `${percent(job)}%` : formatBytes(job.size)}
                </span>
            </div>

            {job.status === 'queued' && <p className={META}>Waiting</p>}

            {job.status === 'uploading' && (
                <div
                    role="progressbar"
                    aria-label={`Uploading ${job.fileName}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent(job)}
                    className="bg-muted h-1.5 overflow-hidden rounded-full"
                >
                    <div className="bg-primary h-full rounded-full transition-[width]" style={{ width: `${percent(job)}%` }} />
                </div>
            )}

            {failed && (
                <>
                    <p role="alert" className="text-destructive text-xs">
                        {job.error}
                    </p>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => retry(job.id)} aria-label={`Retry ${job.fileName}`}>
                            <IconRefresh />
                            Retry
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => dismiss(job.id)}
                            aria-label={`Dismiss ${job.fileName}`}
                        >
                            <IconTimes />
                            Dismiss
                        </Button>
                    </div>
                </>
            )}
        </li>
    );
}

/**
 * Every upload the console is carrying, on whatever screen the operator is on.
 *
 * It renders nothing at all when the queue is empty, so it costs no space until there is something
 * to say.
 */
export function UploadTray() {
    const { jobs, clearFinished, busy } = useUploads();
    if (jobs.length === 0) return null;

    const finished = jobs.filter((job) => job.status === 'done' || job.status === 'failed').length;
    const uploading = jobs.length - finished;

    return (
        <section
            aria-label="Uploads"
            className="bg-card fixed right-4 bottom-4 z-50 w-[19rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-[var(--shadow-card)]"
        >
            <header className="flex items-center gap-2 border-b px-3 py-2">
                <h2 className="text-[13px] font-bold">Uploads</h2>
                <p className={`${META} ml-auto`} aria-live="polite">
                    {busy ? `${uploading} of ${jobs.length} to go` : `${jobs.length} finished`}
                </p>
                {finished > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearFinished}>
                        Clear
                    </Button>
                )}
            </header>
            <ul className="max-h-72 divide-y overflow-y-auto">
                {jobs.map((job) => (
                    <Row key={job.id} job={job} />
                ))}
            </ul>
        </section>
    );
}
