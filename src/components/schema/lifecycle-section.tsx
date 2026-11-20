'use client';

import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api';
import { EMPTY_LIFECYCLE, isEmptyLifecycle, lifecycleProblems } from '@/lib/lifecycle';
import { useSetLifecycle } from '@/hooks/use-schemas';
import type {
    ContentTypeDefinition,
    LifecycleBlocker,
    LifecycleDefinition,
    SetLifecycleResult,
} from '@/types/schema';
import { Button } from '@/components/ui/button';
import { LifecycleDiagram } from './lifecycle-diagram';
import { LifecycleEditor } from './lifecycle-editor';

type Stale = { lifecycle: LifecycleDefinition | null; version: string };

function BlockerList({ items }: { items: LifecycleBlocker[] }) {
    return (
        <ul className="list-disc space-y-1 pl-5 text-sm">
            {items.map((b, i) => (
                <li key={i}>
                    {b.message}
                    {b.count != null && <span className="text-muted-foreground font-mono text-xs"> ({b.count})</span>}
                </li>
            ))}
        </ul>
    );
}

function refusalText(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 403) return 'You are not allowed to change this type, or it belongs to an account.';
        if (status === 404) return 'This content type no longer exists.';
    }
    return apiErrorMessage(error, 'The lifecycle could not be saved.');
}

/**
 * A type's lifecycle: the stored one, and for a type that has a `version`, an editor with a Check
 * step. Save is offered only when the last check of the draft being shown says the edit would be
 * accepted, and it sends the version the edit started from, so another person's edit is refused
 * (412) and never overwritten.
 */
export function LifecycleSection({ schema }: { schema: ContentTypeDefinition }) {
    const setLifecycle = useSetLifecycle(schema.name);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<LifecycleDefinition>(EMPTY_LIFECYCLE);
    const [startedFrom, setStartedFrom] = useState<string | null>(null);
    const [checked, setChecked] = useState<{ draft: LifecycleDefinition; result: SetLifecycleResult } | null>(null);
    const [blocked, setBlocked] = useState<{ errors: string[]; blockers: LifecycleBlocker[]; warnings: LifecycleBlocker[] } | null>(null);
    const [stale, setStale] = useState<Stale | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const lifecycle = schema.lifecycle;
    const hasLifecycle = !!lifecycle && lifecycle.states.length > 0;
    const editable = typeof schema.version === 'string';
    const busy = setLifecycle.isPending;

    const clearAnswers = () => {
        setChecked(null);
        setBlocked(null);
        setStale(null);
        setMessage(null);
    };

    const begin = () => {
        clearAnswers();
        setDraft(hasLifecycle ? lifecycle : EMPTY_LIFECYCLE);
        setStartedFrom(schema.version ?? null);
        setEditing(true);
    };

    const change = (next: LifecycleDefinition) => {
        setDraft(next);
        setBlocked(null);
        setMessage(null);
    };

    const problems = lifecycleProblems(draft);
    const empty = isEmptyLifecycle(draft);
    // The check answers for the draft it ran on. Any later edit makes it a different draft.
    const checkIsCurrent = checked !== null && checked.draft === draft;
    const canSave = checkIsCurrent && checked.result.canApply && stale === null;

    const check = () => {
        const sent = draft;
        setBlocked(null);
        setMessage(null);
        setLifecycle.mutate(
            { lifecycle: sent, dryRun: true },
            {
                onSuccess: (outcome) => {
                    if (outcome.kind === 'answered') setChecked({ draft: sent, result: outcome.result });
                    else if (outcome.kind === 'blocked') setBlocked(outcome);
                    else setStale({ lifecycle: outcome.lifecycle, version: outcome.version });
                },
                onError: (error) => setMessage(refusalText(error)),
            },
        );
    };

    const save = () => {
        setBlocked(null);
        setMessage(null);
        setLifecycle.mutate(
            { lifecycle: draft, dryRun: false, version: startedFrom },
            {
                onSuccess: (outcome) => {
                    if (outcome.kind === 'answered') {
                        setEditing(false);
                        clearAnswers();
                        toast.success('Lifecycle saved');
                    } else if (outcome.kind === 'blocked') {
                        setBlocked(outcome);
                        setChecked(null);
                    } else {
                        setStale({ lifecycle: outcome.lifecycle, version: outcome.version });
                        setChecked(null);
                    }
                },
                onError: (error) => setMessage(refusalText(error)),
            },
        );
    };

    const startAgain = () => {
        if (!stale) return;
        setDraft(stale.lifecycle ?? EMPTY_LIFECYCLE);
        setStartedFrom(stale.version);
        clearAnswers();
    };

    if (editing) {
        return (
            <div className="mb-6 space-y-3">
                <LifecycleEditor value={draft} onChange={change} />

                {stale && (
                    <div role="alert" className="space-y-2 rounded-lg border p-4 text-sm">
                        <p>
                            Someone changed this lifecycle since you opened it. Nothing was saved. Your edit is
                            still on screen, and you can start again from the lifecycle stored now.
                        </p>
                        <Button type="button" variant="outline" size="sm" onClick={startAgain}>
                            Start again from the stored lifecycle
                        </Button>
                    </div>
                )}

                {blocked && (
                    <div role="alert" className="space-y-2 rounded-lg border p-4">
                        <p className="text-sm font-medium">This edit cannot be saved.</p>
                        {blocked.blockers.length > 0 ? (
                            <BlockerList items={blocked.blockers} />
                        ) : (
                            <ul className="list-disc pl-5 text-sm">
                                {blocked.errors.map((e, i) => (
                                    <li key={i}>{e}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {checkIsCurrent && !checked.result.canApply && (
                    <div role="alert" className="space-y-2 rounded-lg border p-4">
                        <p className="text-sm font-medium">This edit would strand the following, so it cannot be saved.</p>
                        <BlockerList items={checked.result.blockers} />
                    </div>
                )}

                {checkIsCurrent && checked.result.canApply && (
                    <p role="status" className="text-sm">
                        {checked.result.changed
                            ? 'Nothing stands in the way. You can save this lifecycle.'
                            : 'This is the lifecycle already stored. Nothing would change.'}
                    </p>
                )}

                {(checkIsCurrent ? checked.result.warnings : (blocked?.warnings ?? [])).length > 0 && (
                    <div className="space-y-2 rounded-lg border p-4">
                        <p className="text-sm font-medium">Left dangling, but not blocking</p>
                        <BlockerList items={checkIsCurrent ? checked.result.warnings : (blocked?.warnings ?? [])} />
                    </div>
                )}

                {message && (
                    <p role="alert" className="text-destructive text-sm">
                        {message}
                    </p>
                )}

                {empty && (
                    <p className="text-muted-foreground text-sm">
                        A saved lifecycle needs at least one state. Removing a lifecycle is not possible here.
                    </p>
                )}
                {problems.map((p) => (
                    <p key={p} role="alert" className="text-destructive text-sm">
                        {p}
                    </p>
                ))}

                <div className="flex gap-2">
                    <Button type="button" variant="outline" disabled={busy || empty || problems.length > 0} onClick={check}>
                        Check
                    </Button>
                    <Button type="button" disabled={busy || !canSave} onClick={save}>
                        Save lifecycle
                    </Button>
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                        Cancel
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <section aria-labelledby="lifecycle-heading" className="mb-6 space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
                <h2 id="lifecycle-heading" className="text-sm font-medium">
                    Lifecycle
                </h2>
                {editable && (
                    <Button type="button" variant="outline" size="sm" onClick={begin}>
                        {hasLifecycle ? 'Edit lifecycle' : 'Add a lifecycle'}
                    </Button>
                )}
            </div>
            {hasLifecycle ? (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 text-sm">
                        <p>
                            States: {lifecycle.states.join(', ')}. New entries start in{' '}
                            <strong>{lifecycle.initialState}</strong>.
                        </p>
                        <ul className="list-disc pl-5">
                            {lifecycle.transitions.map((t) => (
                                <li key={t.name}>
                                    <span className="font-mono">{t.name}</span>: {t.from} to {t.to}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <LifecycleDiagram lifecycle={lifecycle} />
                </div>
            ) : (
                <p className="text-muted-foreground text-sm">No lifecycle. Entries are Draft, Published or Archived.</p>
            )}
            {!editable && <p className="text-muted-foreground text-sm">This lifecycle cannot be changed here.</p>}
        </section>
    );
}
