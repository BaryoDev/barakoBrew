'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useApplySiteBlueprint, useSaveSite, useSiteEntry } from '@/hooks/use-site';
import { apiErrorMessage, isNotFound } from '@/lib/api';
import { SaveConflictError, type SaveBase } from '@/lib/concurrent-save';
import { conflictReason, useConcurrentSave } from '@/hooks/use-concurrent-save';
import { rebaseEdit } from '@/lib/rebase';
import { statusMeta } from '@/lib/status-vocabulary';
import { ContentStatus, type ContentDetailRead } from '@/types/content';
import type { ContentTypeDefinition } from '@/types/schema';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { IconContentTypes } from '@/components/icons';

export interface SiteFormContext {
    /** The stored document with this screen's unsaved edits laid over it. */
    values: Record<string, unknown>;
    set: (field: string, value: unknown) => void;
    entry: ContentDetailRead | null;
    schema: ContentTypeDefinition;
}

/**
 * The frame both Site and Theme share: finding the tenant's `site` entry, offering the blueprint
 * when the type is missing, and saving.
 *
 * Edits are held apart from the entry and laid over it, rather than copied from it once. A save
 * then sends only what this screen touched on top of whatever is stored, and a refetch after
 * someone else saved moves the untouched fields forward without losing what was typed. A JSON map
 * such as Colors is moved forward key by key, from the stored value it was first edited on, so
 * their new key is kept beside the one changed here.
 */
export function SiteForm({
    title,
    description,
    requireEntry = false,
    problem,
    children,
}: {
    title: string;
    description: string;
    /** Theme needs the entry to exist, since creating one needs a Name the Theme screen does not ask for. */
    requireEntry?: boolean;
    /** Why a save would be refused, or null. */
    problem?: (values: Record<string, unknown>) => string | null;
    children: (context: SiteFormContext) => ReactNode;
}) {
    const state = useSiteEntry();
    const apply = useApplySiteBlueprint();
    const save = useSaveSite();
    const [edits, setEdits] = useState<Record<string, unknown>>({});
    /**
     * The entry as it was when this screen was first edited.
     *
     * The save is written against this, not against the freshest read. Sending the freshest version
     * would let a save that was built from an older document succeed, which is how somebody else's
     * change disappears with nothing refusing it.
     */
    const [base, setBase] = useState<(SaveBase & { status: ContentStatus }) | null>(null);
    const saver = useConcurrentSave();
    const conflict = saver.conflict;

    if (state.kind === 'loading') {
        return (
            <>
                <PageHeader title={title} description={description} />
                <TableSkeleton />
            </>
        );
    }

    if (state.kind === 'error') {
        return (
            <>
                <PageHeader title={title} description={description} />
                <ErrorState entity="site settings" onRetry={state.retry} />
            </>
        );
    }

    if (state.kind === 'no-type') {
        return (
            <>
                <PageHeader title={title} description={description} />
                <EmptyState
                    icon={IconContentTypes}
                    title="This tenant has no site type yet"
                    description="Site and Theme edit the one entry of the site content type. Create the type from the site blueprint, then fill it in here."
                    action={
                        <Button
                            size="sm"
                            disabled={apply.isPending}
                            onClick={() =>
                                apply.mutate(undefined, {
                                    onSuccess: () => toast.success('Site type created'),
                                    onError: (error) =>
                                        toast.error(
                                            isNotFound(error)
                                                ? 'This API has no site blueprint. It needs a barakoCMS release newer than 4.1.0.'
                                                : apiErrorMessage(error, 'The site type could not be created.'),
                                        ),
                                })
                            }
                        >
                            {apply.isPending ? 'Creating…' : 'Create the site type'}
                        </Button>
                    }
                />
            </>
        );
    }

    const entry = state.kind === 'entry' ? state.entry : null;

    if (!entry && requireEntry) {
        return (
            <>
                <PageHeader title={title} description={description} />
                <EmptyState
                    icon={IconContentTypes}
                    title="No site entry yet"
                    description="Give the site a name on the Site screen first. The theme is saved to the same entry."
                    action={
                        <Button asChild size="sm" variant="outline">
                            <Link href="/site">Open Site</Link>
                        </Button>
                    }
                />
            </>
        );
    }

    const stored = entry?.data ?? {};
    // What the edits were made from, per key. The same document the save is written against, so
    // what is shown and what is sent cannot disagree about which version this edit answers.
    const baseData = base?.data ?? stored;
    // Shown with this screen's edits laid over what is stored now, key by key, so a field somebody
    // else changed appears without taking the edit with it.
    const values = rebaseEdit(baseData, { ...baseData, ...edits }, stored).data;
    const set = (field: string, value: unknown) => {
        if (!base && entry) {
            setBase({ data: entry.data, version: entry.version, etag: entry.etag, status: entry.status });
        }
        setEdits((current) => ({ ...current, [field]: value }));
    };
    const clearEdits = () => {
        setEdits({});
        setBase(null);
    };
    const dirty = Object.keys(edits).length > 0;
    const refusal = problem?.(values) ?? null;

    /**
     * Takes their version as the one this screen is editing, keeping this screen's value for every
     * field it changed.
     *
     * The edits move with the base, because what is on screen already holds their change everywhere
     * the two did not disagree. Moving the base without them would send this screen's older map
     * back and drop the key they added.
     */
    const loadTheirs = async () => {
        if (state.kind !== 'entry') return;
        const fresh = await state.refetch();
        if (!fresh) return;
        const merged = rebaseEdit(baseData, { ...baseData, ...edits }, fresh.data).data;
        setEdits(Object.fromEntries(Object.keys(edits).map((field) => [field, merged[field]])));
        setBase({ data: fresh.data, version: fresh.version, etag: fresh.etag, status: fresh.status });
        saver.clear();
    };

    const submit = async (status?: ContentStatus) => {
        const against: SaveBase & { status: ContentStatus } = base ?? {
            data: stored,
            version: entry?.version ?? 0,
            etag: entry?.etag,
            status: entry?.status ?? ContentStatus.Draft,
        };

        try {
            await saver.save({
                base: against,
                edit: values,
                read: async () => {
                    if (state.kind !== 'entry') throw new Error('The site entry could not be read back.');
                    const fresh = await state.refetch();
                    if (!fresh) throw new Error('The site entry could not be read back.');
                    return { data: fresh.data, version: fresh.version, etag: fresh.etag, status: fresh.status };
                },
                write: (data, target) =>
                    save.mutateAsync({
                        entry: entry
                            ? { ...entry, data, version: target.version, etag: target.etag, status: target.status }
                            : null,
                        changes: data,
                        status,
                    }),
            });

            clearEdits();
            toast.success(
                status === ContentStatus.Published
                    ? 'Published'
                    : entry?.status === ContentStatus.Published
                      ? 'Saved. The site reads it on its next request.'
                      : 'Saved as a draft. Publish it for the site to use it.',
            );
        } catch (error) {
            toast.error(
                error instanceof SaveConflictError
                    ? error.message
                    : apiErrorMessage(error, 'The site settings could not be saved.'),
            );
        }
    };

    const meta = entry ? statusMeta(entry.status) : null;
    const published = entry?.status === ContentStatus.Published;

    return (
        <>
            <PageHeader
                title={title}
                description={description}
                badge={meta ? <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge> : undefined}
            />

            {state.kind === 'entry' && state.stored > 1 && (
                <div
                    role="alert"
                    className="border-warning/40 bg-[var(--warning-soft)] text-warning mb-4 rounded-xl border px-4 py-3 text-sm font-semibold"
                >
                    This tenant holds {state.stored} site entries. This screen edits the oldest, and a renderer may
                    read another.
                </div>
            )}

            {state.schema.isSingleton === false && (
                <p className="text-muted-foreground mb-4 text-sm">
                    The site type here is not marked as holding one entry, so nothing stops a second one being
                    created from Entries.
                </p>
            )}

            {conflict && (
                <div
                    role="alert"
                    className="border-warning/40 bg-[var(--warning-soft)] text-warning mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
                >
                    <p className="text-sm font-semibold">
                        {conflictReason(
                            conflict.fields,
                            'Someone saved the site entry while you were editing.',
                        )}{' '}
                        Your changes are still here, and nothing was saved.
                    </p>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void loadTheirs()}
                        >
                            Load theirs under my changes
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                                clearEdits();
                                saver.clear();
                            }}
                        >
                            Discard my changes
                        </Button>
                    </div>
                </div>
            )}

            <div className="max-w-3xl space-y-8">{children({ values, set, entry, schema: state.schema })}</div>

            <div className="bg-background/95 sticky bottom-0 mt-8 flex flex-wrap items-center gap-3 border-t py-4 backdrop-blur">
                {entry ? (
                    <>
                        <Button onClick={() => submit()} disabled={!dirty || save.isPending || refusal !== null}>
                            {save.isPending ? 'Saving…' : 'Save changes'}
                        </Button>
                        {!published && (
                            <Button
                                variant="outline"
                                onClick={() => submit(ContentStatus.Published)}
                                disabled={save.isPending || refusal !== null}
                            >
                                Save and publish
                            </Button>
                        )}
                    </>
                ) : (
                    <>
                        <Button
                            onClick={() => submit(ContentStatus.Published)}
                            disabled={save.isPending || refusal !== null}
                        >
                            Publish
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => submit(ContentStatus.Draft)}
                            disabled={save.isPending || refusal !== null}
                        >
                            Save as draft
                        </Button>
                    </>
                )}
                <p className="text-muted-foreground text-sm" role="status">
                    {refusal ??
                        (dirty
                            ? 'Unsaved changes.'
                            : published
                              ? 'Published. Saved changes reach the site on its next request.'
                              : entry
                                ? 'A draft. The site uses this entry once it is published.'
                                : 'Nothing saved yet.')}
                </p>
            </div>
        </>
    );
}
