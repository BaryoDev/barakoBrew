'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Section } from '@/components/site/editors';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { StatusBadge, type Tone } from '@/components/patterns/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconCopy, IconTrash } from '@/components/icons';
import { useCreateShareLink, useRevokeShareLink, useShareLinks } from '@/hooks/use-share-links';
import { apiErrorMessage } from '@/lib/api';
import {
    DEFAULT_SHARE_LINK_DAYS,
    SHARE_LINK_EXPIRY_DAYS,
    shareLinkExpiry,
    shareLinkStatus,
    shareLinkUrl,
    type ShareLinkStatus,
} from '@/lib/site-mode';

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
    hasAddress: boolean;
}

/**
 * Share links let someone see a holding site. Hidden when the API has no share links endpoint.
 *
 * `siteUrl` is the stored address, not the unsaved one, since a link built from an address nobody
 * saved would point at a site that does not answer to it.
 */
export function ShareLinksPanel({ siteUrl }: { siteUrl: unknown }) {
    const links = useShareLinks();
    const create = useCreateShareLink();
    const revoke = useRevokeShareLink();
    const [label, setLabel] = useState('');
    const [days, setDays] = useState<number>(DEFAULT_SHARE_LINK_DAYS);
    const [shown, setShown] = useState<Shown | null>(null);

    if (links.data?.kind === 'disabled') return null;

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const trimmed = label.trim();
        if (!trimmed || create.isPending) return;
        create.mutate(
            { label: trimmed, expiresAt: shareLinkExpiry(days) },
            {
                onSuccess: (result) => {
                    const url = shareLinkUrl(siteUrl, result.key);
                    setShown({ label: result.label, link: url ?? `/_share#${result.key}`, hasAddress: url !== null });
                    setLabel('');
                    setDays(DEFAULT_SHARE_LINK_DAYS);
                    // The mutation keeps its last result, key included, until reset.
                    create.reset();
                },
                onError: (error) => toast.error(apiErrorMessage(error, 'The share link could not be created.')),
            },
        );
    };

    const copy = async () => {
        if (!shown) return;
        try {
            await navigator.clipboard.writeText(shown.link);
            toast.success('Link copied');
        } catch {
            toast.error('The link could not be copied. Select it and copy it by hand.');
        }
    };

    return (
        <Section
            title="Share links"
            description="Let someone see the site while it is holding. A link works until it expires or is revoked, and is not saved with the changes above."
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
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                    >
                        {SHARE_LINK_EXPIRY_DAYS.map((d) => (
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
                <div className="space-y-2 rounded-lg border p-4" role="status">
                    <p className="text-sm font-semibold">Share link for {shown.label}</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input readOnly aria-label="Share link" value={shown.link} className="min-w-0 flex-1 font-mono text-xs" />
                        <Button type="button" variant="outline" onClick={copy}>
                            <IconCopy />
                            Copy
                        </Button>
                    </div>
                    <p className="text-warning text-xs font-semibold">
                        This link cannot be shown again. Copy it now. If it is lost, revoke it and create another.
                    </p>
                    {!shown.hasAddress && (
                        <p className="text-muted-foreground text-xs">
                            The site has no saved address, so this is only the part that goes after it.
                        </p>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShown(null)}>
                        Done
                    </Button>
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
                                                    description="Anyone opening this link sees the holding page again. This cannot be undone."
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
