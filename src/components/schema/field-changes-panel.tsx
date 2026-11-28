'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    FIELD_CHANGES_PAGE_SIZE,
    useFieldChanges,
    useRetryFieldChange,
    type FieldChange,
    type FieldChangeState,
} from '@/hooks/use-field-changes';
import { apiErrorMessage, type Paginated } from '@/lib/api';
import { exactTime, relativeTime } from '@/lib/relative-time';
import { PaginationControls } from '@/components/patterns/pagination-controls';
import { StatusBadge, type Tone } from '@/components/patterns/status-badge';
import { Button } from '@/components/ui/button';

const STATE: Record<FieldChangeState, { label: string; tone: Tone }> = {
    running: { label: 'Running', tone: 'accent' },
    completed: { label: 'Completed', tone: 'success' },
    abandoned: { label: 'Abandoned', tone: 'muted' },
    completed_with_skips: { label: 'Completed with skips', tone: 'warning' },
};

/**
 * What happened to a type's fields: renames, conversions, removals and recomputes, newest first.
 *
 * A change that finished with skips lists the entries it passed over and can be retried. The list
 * is left out when the API has no such route (an older release) or the caller may not manage types.
 */
export function FieldChangesPanel({ typeName }: { typeName: string }) {
    const [page, setPage] = useState(1);
    const { data, isLoading, isError, error } = useFieldChanges(typeName, page);

    // null is a 404 or a 403: nothing to offer, so nothing is drawn.
    if (data === null) return null;

    const items = data?.items ?? [];
    const paged: Paginated<FieldChange> | null = data
        ? {
              ...data,
              totalPages: Math.max(1, Math.ceil(data.totalItems / (data.pageSize || FIELD_CHANGES_PAGE_SIZE))),
              hasNextPage: data.page * data.pageSize < data.totalItems,
              hasPreviousPage: data.page > 1,
          }
        : null;

    return (
        <section aria-labelledby="field-changes-heading" className="mb-6 space-y-3 rounded-lg border p-4">
            <div className="space-y-1">
                <h2 id="field-changes-heading" className="text-sm font-medium">
                    Field changes
                </h2>
                <p className="text-muted-foreground text-sm">
                    Renames, conversions and removals of this type&apos;s fields, newest first.
                </p>
            </div>

            {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
            ) : isError ? (
                <p role="alert" className="text-destructive text-sm">
                    {apiErrorMessage(error, 'The field changes could not be listed.')}
                </p>
            ) : items.length === 0 ? (
                <p className="text-muted-foreground text-sm">No field changes.</p>
            ) : (
                <ul className="divide-y rounded-md border">
                    {items.map((change) => (
                        <ChangeRow key={change.id} change={change} typeName={typeName} />
                    ))}
                </ul>
            )}

            {paged && paged.totalItems > paged.pageSize && (
                <PaginationControls page={paged} onPageChange={setPage} />
            )}
        </section>
    );
}

function ChangeRow({ change, typeName }: { change: FieldChange; typeName: string }) {
    const state = STATE[change.state] ?? { label: change.state, tone: 'muted' as Tone };

    return (
        <li className="space-y-2 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-mono text-xs font-medium">{change.field}</span>
                    <span className="text-muted-foreground">{change.kind}</span>
                    <StatusBadge tone={state.tone} pulse={change.state === 'running'}>
                        {state.label}
                    </StatusBadge>
                    <span className="text-muted-foreground font-mono text-xs tabular-nums">
                        {change.processed} of {change.total}
                    </span>
                </div>
                <span
                    className="text-muted-foreground font-mono text-xs tabular-nums"
                    title={exactTime(change.startedAt)}
                >
                    {relativeTime(change.startedAt)}
                </span>
            </div>

            {change.error && <p className="text-destructive text-xs">{change.error}</p>}

            {change.retryOf && <p className="text-muted-foreground text-xs">Retry of an earlier change</p>}

            {change.state === 'completed_with_skips' && <Skips change={change} typeName={typeName} />}
        </li>
    );
}

function Skips({ change, typeName }: { change: FieldChange; typeName: string }) {
    const retry = useRetryFieldChange(typeName);
    const skipped = change.skipped ?? [];
    const count = change.skippedCount ?? skipped.length;
    const unlisted = count - skipped.length;

    const send = () =>
        retry.mutate(change.id, {
            onSuccess: () => toast.success('Retry started'),
        });

    return (
        <div className="space-y-2">
            <p className="text-warning text-xs">
                {count === 1 ? '1 entry skipped' : `${count} entries skipped`}
            </p>

            {skipped.length > 0 && (
                <ul className="space-y-1 text-xs">
                    {skipped.map((entry) => (
                        <li key={`${entry.entryId}-${entry.at}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Link
                                href={`/content/${encodeURIComponent(entry.entryId)}`}
                                className="font-mono underline underline-offset-2"
                            >
                                {entry.entryId}
                            </Link>
                            <span>{entry.reason}</span>
                            <span className="text-muted-foreground font-mono tabular-nums" title={exactTime(entry.at)}>
                                {relativeTime(entry.at)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {unlisted > 0 && (
                <p className="text-muted-foreground text-xs">
                    and {unlisted} more not listed; a retry makes a full pass
                </p>
            )}

            {change.retriedBy ? (
                <p className="text-muted-foreground text-xs">Retried</p>
            ) : (
                <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="outline" size="sm" disabled={retry.isPending} onClick={send}>
                        Retry
                    </Button>
                    {retry.isError && (
                        <p role="alert" className="text-destructive text-xs">
                            {apiErrorMessage(retry.error, 'The retry could not be started.')}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
