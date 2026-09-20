'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Section } from '@/components/site/editors';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { RevealOnce } from '@/components/patterns/reveal-once';
import { StatusBadge, type Tone } from '@/components/patterns/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconTrash } from '@/components/icons';
import { useCreateShareLink, useRevokeShareLink, useShareLinks } from '@/hooks/use-share-links';
import { apiErrorMessage } from '@/lib/api';
import {
    defaultShareLinkDays,
    maxShareLinkDays,
    shareLinkExpiry,
    shareLinkExpiryChoices,
    shareLinkStatus,
    type ShareLinkScope,
    type ShareLinkStatus,
} from '@/lib/share-links';

const SELECT =
    'border-input bg-transparent dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] sm:w-48';

const STATUS: Record<ShareLinkStatus, { label: string; tone: Tone }> = {
    active: { label: 'Active', tone: 'success' },
    expired: { label: 'Expired', tone: 'muted' },
    revoked: { label: 'Revoked', tone: 'subtle' },
};

function formatDate(value?: string | null, empty = 'Never') {
    if (!value) return empty;
    return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** The link and its key, held only in this component's state until Done. Never cached or refetched. */
interface Shown {
    label: string;
    link: string;
    complete: boolean;
}

/**
 * Share links let someone see what a scope covers. Hidden when the API has no share links for it.
 *
 * Everything that differs between scopes is on the scope, so an entry or page scope needs a builder
 * beside `siteShareScope` and nothing here.
 *
 * The longest expiry is the API's to set, since the API is what refuses one. The panel offers what
 * the list response reports and falls back to the 90 days barakoCMS enforces when it reports
 * nothing, which is every release through 4.3.0.
 */
export function ShareLinksPanel({ scope }: { scope: ShareLinkScope }) {
    const links = useShareLinks(scope);
    const create = useCreateShareLink(scope);
    const revoke = useRevokeShareLink(scope);
    const [label, setLabel] = useState('');
    const [days, setDays] = useState<number | null>(null);
    const [shown, setShown] = useState<Shown | null>(null);

    if (links.data?.kind === 'disabled') return null;

    const maxDays = maxShareLinkDays(links.data?.kind === 'links' ? links.data.maxExpiryDays : null);
    const choices = shareLinkExpiryChoices(maxDays);
    // Null until someone picks, and a pick the maximum no longer allows falls back the same way, so
    // the select can never sit on a value the API would refuse.
    const selected = days !== null && choices.includes(days) ? days : defaultShareLinkDays(maxDays);

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const trimmed = label.trim();
        if (!trimmed || create.isPending) return;
        create.mutate(
            { label: trimmed, expiresAt: shareLinkExpiry(selected, maxDays) },
            {
                onSuccess: (result) => {
                    const target = scope.link(result.key);
                    setShown({ label: result.label, link: target.value, complete: target.complete });
                    setLabel('');
                    setDays(null);
                    // The mutation keeps its last result, key included, until reset.
                    create.reset();
                },
                onError: (error) => toast.error(apiErrorMessage(error, 'The share link could not be created.')),
            },
        );
    };

    return (
        <Section
            title="Share links"
            description={scope.description}
        >
            <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1 space-y-1.5">
                    <Label htmlFor="share-link-label">Label</Label>
                    <Input
                        id="share-link-label"
                        value={label}
                        placeholder="Client preview"
                        onChange={(e) => setLabel(e.target.value)}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="share-link-expiry">Expires after</Label>
                    <select
                        id="share-link-expiry"
                        className={SELECT}
                        value={selected}
                        onChange={(e) => setDays(Number(e.target.value))}
                    >
                        {choices.map((d) => (
                            <option key={d} value={d}>
                                {d === 1 ? '1 day' : `${d} days`}
                            </option>
                        ))}
                    </select>
                </div>
                <Button type="submit" disabled={!label.trim() || create.isPending}>
                    {create.isPending ? 'Creating…' : 'Create link'}
                </Button>
            </form>

            {shown && (
                <div className="rounded-lg border p-4" role="status">
                    <RevealOnce
                        title={`Share link for ${shown.label}`}
                        secret={shown.link}
                        secretLabel="Share link"
                        dismissLabel="Done"
                        onDismiss={() => setShown(null)}
                    >
                        <p className="text-muted-foreground text-xs">
                            If it is lost, revoke it and create another.
                            {!shown.complete && ` ${scope.incompleteNote}`}
                        </p>
                    </RevealOnce>
                </div>
            )}

            {links.isLoading ? (
                <p className="text-muted-foreground text-sm">Loading share links…</p>
            ) : links.isError ? (
                <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
                    <span>The share links could not be loaded.</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => links.refetch()}>
                        Try again
                    </Button>
                </div>
            ) : links.data?.kind === 'links' && links.data.links.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">No share links yet.</p>
            ) : links.data?.kind === 'links' ? (
                <div className="overflow-x-auto rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Label</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Expires</TableHead>
                                <TableHead>Last used</TableHead>
                                <TableHead className="w-10">
                                    <span className="sr-only">Actions</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {links.data.links.map((link) => {
                                const status = shareLinkStatus(link);
                                return (
                                    <TableRow key={link.id}>
                                        <TableCell className="font-medium">{link.label}</TableCell>
                                        <TableCell>
                                            <StatusBadge tone={STATUS[status].tone}>{STATUS[status].label}</StatusBadge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {formatDate(link.createdAt, '')}
                                            {link.createdBy ? ` by ${link.createdBy}` : ''}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {formatDate(link.expiresAt, 'No expiry')}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {formatDate(link.lastUsedAt)}
                                        </TableCell>
                                        <TableCell>
                                            {status !== 'revoked' && (
                                                <ConfirmDialog
                                                    trigger={
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`Revoke ${link.label}`}
                                                            className="text-destructive hover:text-destructive"
                                                        >
                                                            <IconTrash className="size-3.5" />
                                                        </Button>
                                                    }
                                                    title={`Revoke "${link.label}"?`}
                                                    description={scope.revokeWarning}
                                                    confirmLabel="Revoke"
                                                    destructive
                                                    onConfirm={() =>
                                                        revoke.mutate(link.id, {
                                                            onSuccess: () => toast.success(`Revoked "${link.label}"`),
                                                            onError: (error) =>
                                                                toast.error(
                                                                    apiErrorMessage(error, 'The share link could not be revoked.'),
                                                                ),
                                                        })
                                                    }
                                                />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            ) : null}
        </Section>
    );
}
