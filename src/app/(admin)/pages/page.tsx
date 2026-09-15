'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useSchemas } from '@/hooks/use-schemas';
import {
    PageChangedError,
    useCreateRedirect,
    useInvalidatePageTree,
    usePageTree,
    writePageFields,
} from '@/hooks/use-pages';
import { apiErrorMessage } from '@/lib/api';
import {
    PAGE_FIELDS,
    pathOf,
    planMove,
    redirectOffers,
    SUPPORTED_PAGES_CONTRACT,
    type DropPosition,
    type FlatPage,
    type KeyMove,
    type PageForest,
    type RedirectOffer,
} from '@/lib/page-tree';
import { statusMeta } from '@/lib/status-vocabulary';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { PageTree, pageName } from '@/components/pages/page-tree';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { IconList, IconPlus } from '@/components/icons';

const newPageHref = (contentType: string) => `/content/new?type=${encodeURIComponent(contentType)}`;

function failure(error: unknown, fallback: string): string {
    return error instanceof PageChangedError ? error.message : apiErrorMessage(error, fallback);
}

export default function PagesPage() {
    const { data, isLoading, isError, refetch } = usePageTree();
    const { data: schemas } = useSchemas();
    const invalidate = useInvalidatePageTree();

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [announcement, setAnnouncement] = useState('');
    const [offers, setOffers] = useState<RedirectOffer[] | null>(null);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [focus, setFocus] = useState<{ id: string; move: KeyMove } | null>(null);

    const options = data?.kind === 'tree' ? data.options : PAGE_FIELDS;
    const pageType = schemas?.find((s) => s.name.toLowerCase() === options.contentType.toLowerCase());
    const slugField = pageType?.fields.find((f) => f.type.toLowerCase() === 'slug')?.name;

    const header = (
        <PageHeader
            title="Pages"
            description="Drag a page, or use its move buttons, to reorder it or put it under another page."
            actions={
                <Button asChild size="sm">
                    <Link href={newPageHref(options.contentType)}>
                        <IconPlus className="size-3.5" />
                        New page
                    </Link>
                </Button>
            }
        />
    );

    if (isLoading) return (<>{header}<TableSkeleton /></>);
    if (isError || !data) return (<>{header}<ErrorState entity="pages" onRetry={() => refetch()} /></>);

    if (data.kind === 'disabled') {
        return (
            <>
                {header}
                <EmptyState
                    icon={IconList}
                    title="The Pages module is not enabled"
                    description="This API does not serve a page tree. Enable BarakoCMS.Pages on the API to arrange pages here. Pages can still be edited as entries."
                    action={
                        <Button asChild variant="outline" size="sm">
                            <Link href="/content">Open entries</Link>
                        </Button>
                    }
                />
            </>
        );
    }

    const truncatedNotice = data.truncated && (
        <p role="status" className="bg-[var(--warning-soft)] text-warning mb-4 rounded-lg px-4 py-3 text-sm">
            Not every page is shown. The site has more pages than the API reads for one tree (its
            MaxPages setting), so some are missing here.
        </p>
    );

    if (data.kind === 'flat') {
        return (
            <>
                {header}
                <p role="status" className="bg-secondary mb-4 rounded-lg px-4 py-3 text-sm">
                    This API sends page tree contract {data.contract ?? 'none'}, and this console reads contract{' '}
                    {SUPPORTED_PAGES_CONTRACT.min === SUPPORTED_PAGES_CONTRACT.max
                        ? SUPPORTED_PAGES_CONTRACT.min
                        : `${SUPPORTED_PAGES_CONTRACT.min} to ${SUPPORTED_PAGES_CONTRACT.max}`}
                    . Pages are listed without nesting, and moving is off until the console is updated.
                </p>
                {truncatedNotice}
                <FlatPageList rows={data.rows} />
            </>
        );
    }

    const forest = data.forest;
    // A move renumbers the pages it can see, so with some missing it would put them out of order.
    const canMove = !data.truncated;

    const move = async (id: string, targetId: string, position: DropPosition, via: 'drag' | KeyMove) => {
        const plan = planMove(forest, id, targetId, position);
        const node = forest.byId.get(id);
        if (!canMove || !plan || !node) return;
        const pending = redirectOffers(forest, id, { parent: { id, parentId: plan.parentId } }, options.homeSlug);

        setBusy(true);
        setErrors({});
        setOffers(null);
        setFocus(via === 'drag' ? null : { id, move: via });
        let current = id;
        let movedSaved = false;
        try {
            for (const write of plan.writes) {
                current = write.id;
                const fields: Record<string, unknown> = { [options.order]: write.order };
                // Undefined removes the field, which is what a top-level page has.
                if (write.parent) fields[options.parent] = write.parent.id ?? undefined;
                const shown = forest.byId.get(write.id);
                await writePageFields(write.id, fields, {
                    parentField: options.parent,
                    parentId: shown?.parentId ?? null,
                    orderField: options.order,
                    order: shown?.order ?? null,
                });
                if (write.id === id) movedSaved = true;
            }
            const parent = plan.parentId ? forest.byId.get(plan.parentId) : undefined;
            setAnnouncement(`${pageName(node)} moved ${parent ? `under ${pageName(parent)}` : 'to the top level'}.`);
            if (pending.length > 0) setOffers(pending);
        } catch (error) {
            const message = failure(error, 'The page could not be moved.');
            if (movedSaved) {
                // The moved page's own write went through, so its address has changed whatever happened after.
                setErrors({ [current]: `${message} ${pageName(node)} was moved, but the order was only partly saved.` });
                if (pending.length > 0) setOffers(pending);
            } else {
                setErrors({ [current]: message });
            }
        } finally {
            invalidate();
            setBusy(false);
        }
    };

    const toggleNavigation = async (id: string, value: boolean) => {
        setBusy(true);
        setErrors({});
        try {
            await writePageFields(id, { [options.showInNavigation]: value });
            const node = forest.byId.get(id);
            setAnnouncement(`${node ? pageName(node) : 'Page'} ${value ? 'shown in' : 'hidden from'} navigation.`);
        } catch (error) {
            setErrors({ [id]: failure(error, 'The page could not be saved.') });
        } finally {
            invalidate();
            setBusy(false);
        }
    };

    return (
        <>
            {header}
            {truncatedNotice}
            {!canMove && (
                <p className="text-muted-foreground mb-4 text-sm">
                    Moving is off while pages are missing, because a move renumbers the pages next to it.
                </p>
            )}
            {offers && <RedirectOfferPanel offers={offers} onDone={() => setOffers(null)} />}
            {forest.rootIds.length === 0 ? (
                <EmptyState
                    icon={IconList}
                    title="No pages yet"
                    description="Create the first page, then add pages under it to build the tree."
                    action={
                        <Button asChild size="sm">
                            <Link href={newPageHref(options.contentType)}>New page</Link>
                        </Button>
                    }
                />
            ) : (
                <PageTree
                    forest={forest}
                    options={options}
                    busy={busy}
                    canMove={canMove}
                    focus={focus}
                    errors={errors}
                    onMove={(id, targetId, position, via) => void move(id, targetId, position, via)}
                    onToggleNavigation={(id, value) => void toggleNavigation(id, value)}
                    onChangeSlug={slugField ? setRenaming : undefined}
                />
            )}
            <p aria-live="polite" className="sr-only">
                {announcement}
            </p>
            {renaming && slugField && (
                <ChangeSlugDialog
                    forest={forest}
                    id={renaming}
                    slugField={slugField}
                    homeSlug={options.homeSlug}
                    onClose={() => setRenaming(null)}
                    onSaved={(next) => {
                        setRenaming(null);
                        invalidate();
                        setAnnouncement('Slug changed.');
                        if (next.length > 0) setOffers(next);
                    }}
                />
            )}
        </>
    );
}

function FlatPageList({ rows }: { rows: FlatPage[] }) {
    if (rows.length === 0) {
        return <p className="text-muted-foreground text-sm">No pages could be read from this response.</p>;
    }
    return (
        <ul className="space-y-1.5">
            {rows.map((row) => {
                const meta = row.status ? statusMeta(row.status) : null;
                return (
                    <li key={row.id} className="bg-card flex items-center gap-3 rounded-lg border px-3 py-2">
                        <div className="min-w-0 flex-1">
                            <Link href={`/content/${row.id}`} className="block truncate text-sm font-medium hover:underline">
                                {pageName(row)}
                            </Link>
                            {row.path && <p className="text-muted-foreground truncate font-mono text-xs">{row.path}</p>}
                        </div>
                        {meta && <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>}
                    </li>
                );
            })}
        </ul>
    );
}

function RedirectOfferPanel({ offers, onDone }: { offers: RedirectOffer[]; onDone: () => void }) {
    const createRedirect = useCreateRedirect();
    const permanentId = useId();
    const headingId = useId();
    const [permanent, setPermanent] = useState(false);
    const [saving, setSaving] = useState(false);
    const [results, setResults] = useState<Record<string, { ok: boolean; message: string }> | null>(null);

    const addAll = async () => {
        setSaving(true);
        const next: Record<string, { ok: boolean; message: string }> = {};
        for (const offer of offers) {
            try {
                await createRedirect.mutateAsync({ ...offer, permanent, note: 'Page moved in the console' });
                next[offer.fromPath] = { ok: true, message: 'Added' };
            } catch (error) {
                next[offer.fromPath] = { ok: false, message: apiErrorMessage(error, 'Not added.') };
            }
        }
        setResults(next);
        setSaving(false);
    };

    return (
        <section aria-labelledby={headingId} className="bg-card mb-4 space-y-3 rounded-xl border px-4 py-3">
            <div>
                <h2 id={headingId} className="text-sm font-semibold">
                    {offers.length === 1 ? 'A page address changed' : `${offers.length} page addresses changed`}
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                    Links to the old addresses stop working. Add a redirect from each old path to its new one?
                </p>
            </div>
            <ul className="space-y-1 text-sm">
                {offers.map((offer) => {
                    const result = results?.[offer.fromPath];
                    return (
                        <li key={offer.fromPath} data-offer={offer.fromPath}>
                            <span className="font-mono text-xs">{offer.fromPath}</span>
                            <span className="text-muted-foreground"> to </span>
                            <span className="font-mono text-xs">{offer.toPath}</span>
                            {result && (
                                <span className={result.ok ? 'text-success ml-2 text-xs' : 'text-destructive ml-2 text-xs'}>
                                    {result.message}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
            {results ? (
                <Button size="sm" variant="outline" onClick={onDone}>
                    Close
                </Button>
            ) : (
                <>
                    <div className="flex items-start gap-2">
                        <Checkbox
                            id={permanentId}
                            checked={permanent}
                            onCheckedChange={(value) => setPermanent(value === true)}
                        />
                        <Label htmlFor={permanentId} className="text-sm font-normal">
                            Permanent (301). Browsers keep a 301 for good, so leave this off until you are sure.
                        </Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => void addAll()} disabled={saving}>
                            {saving ? 'Adding...' : offers.length === 1 ? 'Add redirect' : 'Add redirects'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={onDone} disabled={saving}>
                            Not now
                        </Button>
                    </div>
                </>
            )}
        </section>
    );
}

function ChangeSlugDialog({
    forest,
    id,
    slugField,
    homeSlug,
    onClose,
    onSaved,
}: {
    forest: PageForest;
    id: string;
    slugField: string;
    homeSlug: string | null;
    onClose: () => void;
    onSaved: (offers: RedirectOffer[]) => void;
}) {
    const node = forest.byId.get(id);
    const inputId = useId();
    const [slug, setSlug] = useState(node?.slug ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!node) return null;
    const trimmed = slug.trim();
    const preview = trimmed ? pathOf(forest, id, { slug: { id, slug: trimmed } }, homeSlug) : null;

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            await writePageFields(id, { [slugField]: trimmed });
            onSaved(redirectOffers(forest, id, { slug: { id, slug: trimmed } }, homeSlug));
        } catch (e) {
            setError(failure(e, 'The slug could not be saved.'));
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Change the slug of {pageName(node)}</DialogTitle>
                    <DialogDescription>
                        The slug is the last part of the page address. Pages under this one move with it.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <Label htmlFor={inputId}>Slug</Label>
                    <Input id={inputId} value={slug} onChange={(e) => setSlug(e.target.value)} />
                    <p className="text-muted-foreground font-mono text-xs">{preview ?? 'No path'}</p>
                    {error && (
                        <p role="alert" className="text-destructive text-sm">
                            {error}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={saving || !trimmed || trimmed === node.slug}>
                        {saving ? 'Saving...' : 'Save slug'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
