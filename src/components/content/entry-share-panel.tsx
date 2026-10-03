'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Section } from '@/components/site/editors';
import { ShareLinksPanel } from '@/components/site/share-links-panel';
import { RevealOnce } from '@/components/patterns/reveal-once';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSiteEntry } from '@/hooks/use-site';
import { useCreatePreviewToken } from '@/hooks/use-share-links';
import { apiErrorMessage } from '@/lib/api';
import { entrySlug, isSitePath, previewLinkUrl } from '@/lib/share-links';
import { entryShareScope, siteBaseUrl } from '@/lib/site-mode';
import type { FieldDefinition } from '@/types/schema';

interface Shown {
    link: string;
    complete: boolean;
    expiresAt: string;
}

/**
 * Share links for one entry, and a short-lived preview link.
 *
 * The share links need update on the entry and the panel hides itself for anyone without it. A
 * preview link needs only read, so it stays for them.
 */
export function EntrySharePanel({
    entryId,
    contentType,
    fields,
    data,
}: {
    entryId: string;
    contentType: string;
    fields: FieldDefinition[];
    data: Record<string, unknown>;
}) {
    const site = useSiteEntry();
    const siteUrl = site.kind === 'entry' ? site.entry.data?.Url : undefined;

    return (
        <div className="space-y-6">
            <ShareLinksPanel scope={entryShareScope(entryId, siteUrl)} />
            <PreviewLinkSection
                contentType={contentType}
                slug={entrySlug(fields, data)}
                siteUrl={siteBaseUrl(siteUrl)}
            />
        </div>
    );
}

function PreviewLinkSection({
    contentType,
    slug,
    siteUrl,
}: {
    contentType: string;
    slug: string | null;
    siteUrl: string | null;
}) {
    const create = useCreatePreviewToken();
    // Where the site serves this entry. The API documents `/{type}/{slug}`; a site that routes the
    // type elsewhere is corrected here before the link is made.
    const [path, setPath] = useState(slug ? `/${contentType}/${slug}` : '');
    const [shown, setShown] = useState<Shown | null>(null);

    if (!slug) {
        return (
            <Section
                title="Preview link"
                description="A preview link is found by the entry's slug, and this type has no slug field, or this entry has no slug yet."
            >
                {null}
            </Section>
        );
    }

    const trimmed = path.trim();
    const pathOk = isSitePath(trimmed);

    const issue = () => {
        if (!pathOk || create.isPending) return;
        create.mutate(
            { type: contentType, slug },
            {
                onSuccess: (result) => {
                    const link = previewLinkUrl(siteUrl, trimmed, result.token, result.queryParam);
                    setShown({
                        link: link ?? `${trimmed}?${result.queryParam ?? 'preview'}=${result.token}`,
                        complete: link !== null,
                        expiresAt: result.expiresAt,
                    });
                    create.reset();
                },
                onError: (error) => toast.error(apiErrorMessage(error, 'The preview link could not be issued.')),
            },
        );
    };

    return (
        <Section
            title="Preview link"
            description="A link that shows this entry as it is now, draft included, for 30 minutes. It cannot be listed or revoked; it ends when it expires."
        >
            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1 space-y-1.5">
                    <Label htmlFor="preview-link-path">Path on the site</Label>
                    <Input
                        id="preview-link-path"
                        value={path}
                        aria-invalid={pathOk ? undefined : true}
                        onChange={(e) => setPath(e.target.value)}
                    />
                </div>
                <Button type="button" variant="outline" onClick={issue} disabled={!pathOk || create.isPending}>
                    {create.isPending ? 'Issuing…' : 'Issue preview link'}
                </Button>
            </div>

            {shown && (
                <div className="rounded-lg border p-4" role="status">
                    <RevealOnce
                        title="Preview link"
                        secret={shown.link}
                        secretLabel="Preview link"
                        dismissLabel="Done"
                        onDismiss={() => setShown(null)}
                    >
                        <p className="text-muted-foreground text-xs">
                            Works until {new Date(shown.expiresAt).toLocaleTimeString()}.
                            {!shown.complete &&
                                ' The site has no saved address, so this is only the part that goes after it.'}
                        </p>
                    </RevealOnce>
                </div>
            )}
        </Section>
    );
}
