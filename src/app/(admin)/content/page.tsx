'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSchemas } from '@/hooks/use-schemas';
import {
  useContents,
  useContentCounts,
  useBulkContentStatus,
  type BulkStatusChange,
} from '@/hooks/use-contents';
import { toast } from 'sonner';
import { apiErrorMessage, tenantOfToken, tokenStore } from '@/lib/api';
import { useCurrentTenant } from '@/hooks/use-tenants';
import { Checkbox } from '@/components/ui/checkbox';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { ContentStatus, type ContentListItem } from '@/types/content';
import {
  STATUS_ORDER,
  STATUS_VOCABULARY,
  statusFromParam,
  statusMeta,
} from '@/lib/status-vocabulary';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { StatusBadge } from '@/components/patterns/status-badge';
import { ErrorState } from '@/components/patterns/error-state';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { PaginationControls } from '@/components/patterns/pagination-controls';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { EntryTypeTabs, ALL_TYPES } from '@/components/content/entry-type-tabs';
import { EntryStatusChips } from '@/components/content/entry-status-chips';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { IconContent, IconLock, IconPlus } from '@/components/icons';
import { TypeIcon } from '@/components/schema/type-icon';
import type { ContentTypeIcon } from '@/types/schema';
import { useDebounced } from '@/hooks/use-debounced';
import { exactTime, relativeTime } from '@/lib/relative-time';
import { contentTitle } from '@/lib/content-title';
import { singletonHref } from '@/lib/navigation';
import { IconChevronLeft } from '@/components/icons';

/** Where a new entry of a type is written. Encoded, the way every other generated link here is. */
function newEntryHref(contentType?: string): string {
  return contentType ? `/content/new?type=${encodeURIComponent(contentType)}` : '/content/new';
}

/**
 * The status filter, in the design's order.
 *
 * Undefined rather than an 'all' sentinel, so "no filter" is the absence of the parameter and the
 * server is never sent a status it would have to know to ignore. The sentinel exists only inside
 * the control, which needs a value per option.
 *
 * Built from the vocabulary rather than typed out, so the buttons and the badges cannot disagree
 * about what a state is called. Filtered by what the enum has, because a value here goes to the
 * server as a query parameter: the vocabulary carries In review ahead of the API, and a button
 * asking for a status the server has never heard of is a button that returns nothing. It appears on
 * its own once the enum gains the member.
 */
const STATUS_FILTERS: { label: string; value: ContentStatus | undefined }[] = [
  { label: 'All', value: undefined },
  ...STATUS_ORDER.filter((key) => key in ContentStatus).map((key) => ({
    label: STATUS_VOCABULARY[key].label,
    value: ContentStatus[key as keyof typeof ContentStatus],
  })),
];

/** On the sunken tint. The type comes from TableHead: 12px, muted, sentence case. */
const HEAD = 'h-auto bg-background py-3';

/** Machine-produced cell values: mono, tabular, muted. Types, versions, timestamps. */
const META = 'text-muted-foreground font-mono text-[11.5px] tabular-nums';

/**
 * The entries table, as TanStack Table columns. Core features only: the server pages, searches and
 * filters (see the filter bar below), so the table renders the page it is handed and nothing in it
 * sorts or slices rows. Paging stays in the URL and in PaginationControls, where a link can carry it.
 */
const features = tableFeatures({});
const column = createColumnHelper<typeof features, ContentListItem>();

/** The Signal classes for each column's head and cells, by column id. */
const COLUMN_CLASSES: Record<string, { head: string; cell: string }> = {
  select: { head: `${HEAD} w-11 pl-4`, cell: 'w-11 py-3.5 pl-4' },
  entry: { head: HEAD, cell: 'max-w-md py-3.5' },
  type: { head: HEAD, cell: `${META} py-3.5` },
  status: { head: HEAD, cell: 'py-3.5' },
  version: {
    head: `${HEAD} hidden text-right md:table-cell`,
    cell: `${META} hidden py-3.5 text-right md:table-cell`,
  },
  updated: {
    head: `${HEAD} hidden pr-6 text-right sm:table-cell`,
    cell: `${META} hidden py-3.5 pr-6 text-right sm:table-cell`,
  },
};

const NO_ROWS: ContentListItem[] = [];
const NO_IDS: ReadonlySet<string> = new Set();

/** What the selection column needs from the screen. */
interface Selection {
  ids: ReadonlySet<string>;
  allOnPage: boolean;
  someOnPage: boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
}

function entryColumns(
  privateTypes: ReadonlySet<string>,
  typeIcons: ReadonlyMap<string, ContentTypeIcon | null | undefined>,
  selection: Selection
) {
  return column.columns([
    column.display({
      id: 'select',
      header: () => (
        <Checkbox
          aria-label="Select all entries on this page"
          checked={selection.allOnPage ? true : selection.someOnPage ? 'indeterminate' : false}
          onCheckedChange={selection.toggleAll}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${contentTitle(row.original.data, row.original.id)}`}
          checked={selection.ids.has(row.original.id)}
          onCheckedChange={() => selection.toggle(row.original.id)}
        />
      ),
    }),
    column.display({
      id: 'entry',
      header: 'Entry',
      cell: ({ row }) => (
        <Link
          href={`/content/${row.original.id}`}
          className="focus-visible:ring-ring block truncate text-[13.5px] font-bold rounded-sm outline-none focus-visible:ring-[3px]"
        >
          {contentTitle(row.original.data, row.original.id)}
        </Link>
      ),
    }),
    column.accessor('contentType', {
      id: 'type',
      header: 'Type',
      cell: ({ getValue }) => (
        <span className="inline-flex items-center gap-1.5">
          <TypeIcon icon={typeIcons.get(getValue())} aria-hidden className="size-3.5" />
          {getValue()}
        </span>
      ),
    }),
    column.accessor('status', {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const meta = statusMeta(row.original.status);
        return (
          <div className="flex items-center gap-1.5">
            <StatusBadge tone={meta.tone} dot={false}>
              {meta.label}
            </StatusBadge>
            {privateTypes.has(row.original.contentType) && (
              <StatusBadge tone="accent" dot={false}>
                <IconLock aria-hidden />
                Private
              </StatusBadge>
            )}
          </div>
        );
      },
    }),
    column.accessor('version', {
      id: 'version',
      header: 'V',
      // Nothing, not a zero, when the server did not send a version. A cell reading 0 is a claim
      // about the entry; an empty one says the server did not answer. Absent is a pre-4.0 API. Zero
      // is a 4.x one saying the entry has no event stream behind it, which is every seeded row, so
      // the two mean the same thing here and read the same way.
      cell: ({ getValue }) => getValue() || '',
    }),
    column.accessor('updatedAt', {
      id: 'updated',
      header: 'Updated',
      // The exact time rides in the title, so "3h ago" is never the only thing a reader gets.
      cell: ({ getValue }) => (
        <time dateTime={getValue()} title={exactTime(getValue())}>
          {relativeTime(getValue())}
        </time>
      ),
    }),
  ]);
}

function ContentListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The filters live in the query string rather than in state, so a link to this screen opens the
  // same screen. Somebody sending "the drafts that mention invoicing" to a colleague was sending
  // them an unfiltered table.
  const contentType = searchParams.get('type') ?? undefined;
  const urlQuery = searchParams.get('q') ?? '';
  const status = statusFromParam(searchParams.get('status'));
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  // The ticked entries. A selection belongs to the page and filters it was made on, which is the
  // query string, so any change to them drops it: a bar saying "3 selected" over rows that are no
  // longer there would act on entries nobody can see. Read as empty rather than cleared in an
  // effect, so there is no render where the old ticks sit over the new rows.
  const scope = searchParams.toString();
  const [ticked, setTicked] = useState<{
    scope: string;
    ids: ReadonlySet<string>;
  }>({
    scope,
    ids: NO_IDS,
  });
  const selected = ticked.scope === scope ? ticked.ids : NO_IDS;
  const setSelected = useCallback(
    (next: ReadonlySet<string> | ((prev: ReadonlySet<string>) => ReadonlySet<string>)) =>
      setTicked((prev) => {
        const current = prev.scope === scope ? prev.ids : NO_IDS;
        return {
          scope,
          ids: typeof next === 'function' ? next(current) : next,
        };
      }),
    [scope]
  );

  const setParams = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      router.replace(query ? `/content?${query}` : '/content');
    },
    [router, searchParams]
  );

  const [search, setSearch] = useState(urlQuery);

  // Typing is not a request. Without this every keystroke is a round trip that materialises the
  // permitted set server side, and the answers can arrive out of order, so the table settles on
  // whichever query happened to finish last rather than on what is in the box.
  const query = useDebounced(search, 300);

  /**
   * The search the URL held when this screen last drew, which is what tells the two ways the box
   * and the URL can disagree apart.
   *
   * The URL lagging behind the box is this screen's own write on its way through the router. The
   * URL changing to something the box did not ask for is a navigation: the Entries link in the
   * rail, which drops the search, or a pasted address. Comparing the two values cannot separate
   * them, because on the render where the debounce settles they differ for the first reason and on
   * the render after a navigation they differ for the second. Comparing the URL against itself can.
   */
  const [urlQueryAsDrawn, setUrlQueryAsDrawn] = useState(urlQuery);

  if (urlQuery !== urlQueryAsDrawn) {
    setUrlQueryAsDrawn(urlQuery);
    // Not what this screen asked for, so somebody navigated and the box follows.
    if (urlQuery !== query) setSearch(urlQuery);
  }

  // The box leads and the URL follows, once the typing has settled. Waiting for the debounce is
  // what stops a navigation that empties the search being written straight back from a box the
  // debounce has not caught up with yet.
  useEffect(() => {
    if (search !== query) return;
    if (query !== urlQuery) setParams({ q: query, page: null });
  }, [search, query, urlQuery, setParams]);

  // Every filter goes back to page one. Staying on page four of a wider result and then narrowing
  // it shows an empty table beside a count saying there are matches, which reads as a broken search.
  const changeStatus = (value: ContentStatus | undefined) => {
    setParams({ status: value ?? null, page: null });
  };

  /** Whether the empty table is empty because of a filter, which changes what to tell the reader. */
  const filtered = query.length > 0 || status !== undefined;

  const { data: schemas } = useSchemas();

  // A single-entry type has no list. Links and bookmarks that filter by it land on its edit screen.
  const singleton = schemas?.find((s) => s.name === contentType && s.isSingleton === true);
  useEffect(() => {
    if (singleton) router.replace(singletonHref(singleton.name));
  }, [singleton, router]);

  const {
    data: contents,
    isLoading,
    isError,
    refetch,
  } = useContents({
    page,
    pageSize: 20,
    contentType,
    search: query || undefined,
    status,
  });

  /**
   * Which content types are not served anonymously, so a row can be marked Private.
   *
   * Only a type the schema list positively reports as `false` goes in. An unknown type and an
   * absent flag are the same thing here, which is that the server did not say, and a lock icon is
   * a claim about who can read the entry. Guessing it is worse than leaving it off: the pill would
   * be indistinguishable from one the server actually stood behind.
   */
  const privateTypes = useMemo(
    () =>
      new Set((schemas ?? []).filter((s) => s.isPubliclyDeliverable === false).map((s) => s.name)),
    [schemas]
  );

  const typeIcons = useMemo(
    () => new Map((schemas ?? []).map((s) => [s.name, s.icon] as const)),
    [schemas]
  );

  const items = contents?.items ?? NO_ROWS;
  const selectedItems = items.filter((item) => selected.has(item.id));
  const allOnPage = items.length > 0 && selectedItems.length === items.length;
  const selection = useMemo<Selection>(
    () => ({
      ids: selected,
      allOnPage,
      someOnPage: selectedItems.length > 0,
      toggle: (id) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (!next.delete(id)) next.add(id);
          return next;
        }),
      toggleAll: () => setSelected(allOnPage ? new Set() : new Set(items.map((item) => item.id))),
    }),
    [selected, allOnPage, selectedItems.length, items, setSelected]
  );

  const columns = useMemo(
    () => entryColumns(privateTypes, typeIcons, selection),
    [privateTypes, typeIcons, selection]
  );
  const table = useTable({
    features,
    columns,
    data: contents?.items ?? NO_ROWS,
    getRowId: (item) => item.id,
  });

  const bulk = useBulkContentStatus();

  /**
   * What the bulk actions leave out of the selection, and why.
   *
   * A Scheduled entry is left out because the status route clears its publish time, so undoing
   * the change would put it back to Scheduled with nothing to publish at. An entry of a type with
   * its own lifecycle is left out because the plain status route refuses it. Both are said in the
   * bar, so the count of what will move is never a surprise.
   */
  const lifecycleTypes = useMemo(
    () =>
      new Set(
        (schemas ?? []).filter((s) => (s.lifecycle?.states.length ?? 0) > 0).map((s) => s.name)
      ),
    [schemas]
  );
  const leftOutScheduled = selectedItems.filter((i) => i.status === ContentStatus.Scheduled);
  const leftOutLifecycle = selectedItems.filter(
    (i) => i.status !== ContentStatus.Scheduled && lifecycleTypes.has(i.contentType)
  );
  const eligible = selectedItems.filter(
    (i) => !leftOutScheduled.includes(i) && !leftOutLifecycle.includes(i)
  );

  // Toasts this screen raised, so a tenant switch takes them down: an Undo that outlived it would
  // write to another tenant's entries.
  const tenant = useCurrentTenant();
  const toastIds = useRef<(string | number)[]>([]);
  useEffect(
    () => () => {
      toastIds.current.forEach((id) => toast.dismiss(id));
      toastIds.current = [];
    },
    [tenant]
  );

  /** One line for what the API refused: conflicts as a refresh, anything else in its own words. */
  const report = (failed: { error: unknown }[], total: number) => {
    if (failed.length === 0) return;
    const conflicts = failed.filter(
      (f) => axios.isAxiosError(f.error) && f.error.response?.status === 409
    );
    const others = failed.filter((f) => !conflicts.includes(f));
    toast.error(
      [
        `${failed.length} of ${total} could not be changed.`,
        conflicts.length > 0 && `${conflicts.length} changed by someone else, refresh.`,
        others.length > 0 && apiErrorMessage(others[0].error, 'The API refused it.'),
      ]
        .filter(Boolean)
        .join(' ')
    );
  };

  /**
   * Moves the eligible ticked entries to a status with the per-entry status route, then offers to
   * put each back as it was. Entries already there are left out. One refused does not stop the
   * others. The undo works once, and moves back only the entries still in the status this change
   * gave them, read again first, so it never overwrites somebody else's edit.
   */
  const moveSelected = async (target: ContentStatus, done: string) => {
    const before = new Map(eligible.map((item) => [item.id, item.status]));
    const changes: BulkStatusChange[] = eligible
      .filter((item) => item.status !== target)
      .map((item) => ({ id: item.id, status: target }));
    if (changes.length === 0) {
      setSelected(new Set());
      return;
    }
    const startedIn = tenantOfToken(tokenStore.token);
    let result;
    try {
      result = await bulk.mutateAsync(changes);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The entries could not be changed.'));
      return;
    }
    setSelected(new Set());
    report(result.failed, changes.length);
    if (result.done.length === 0) return;

    let undone = false;
    const toastId = toast(
      `${result.done.length} ${result.done.length === 1 ? 'entry' : 'entries'} ${done}`,
      {
        duration: 8000,
        action: {
          label: 'Undo',
          onClick: async () => {
            if (undone || tenantOfToken(tokenStore.token) !== startedIn) return;
            undone = true;
            toast.dismiss(toastId);
            try {
              const back = await bulk.mutateAsync(
                result.done.map((id) => ({
                  id,
                  status: before.get(id) as ContentStatus,
                  onlyIfCurrently: target,
                }))
              );
              report(back.failed, result.done.length);
              if (back.skipped.length > 0) {
                toast(
                  `${back.skipped.length} ${back.skipped.length === 1 ? 'entry was' : 'entries were'} changed since and left as they are.`
                );
              }
            } catch (error) {
              toast.error(apiErrorMessage(error, 'The change could not be undone.'));
            }
          },
        },
      }
    );
    toastIds.current.push(toastId);
  };

  const setType = (value: string) => {
    setParams({ type: value === ALL_TYPES ? null : value, page: null });
  };

  const schema = schemas?.find((s) => s.name === contentType);

  // A single-entry type has no list, so it has no tab either.
  const tabTypes = (schemas ?? []).filter((s) => s.isSingleton !== true);

  /**
   * What each chip says, from GET /api/contents/counts for the chosen type.
   *
   * Counts are the type's, not the page's and not the search's: they do not move when a status is
   * chosen or a title typed, which is what lets one chip be compared with another. They are empty
   * until the reply arrives, and chips show no number rather than a zero while they are.
   */
  const { data: counts } = useContentCounts(contentType);
  const statusCounts: Record<string, number> = counts
    ? {
        all: counts.total,
        [ContentStatus.Draft]: counts.draft,
        [ContentStatus.Published]: counts.published,
        [ContentStatus.Archived]: counts.archived,
        [ContentStatus.Scheduled]: counts.scheduled,
      }
    : {};

  return (
    <Tabs value={contentType ?? ALL_TYPES} onValueChange={setType} className="gap-0">
      {/* The way back to where the type was chosen. The header crumb says Entries, which is the
          route; this says which type's entries these are and how to get out of them. */}
      {contentType && (
        <Link
          href="/schemas"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mb-3 -mt-1 inline-flex items-center gap-1 rounded-sm text-sm outline-none focus-visible:ring-[3px]"
        >
          <IconChevronLeft className="size-3.5" />
          Content types
        </Link>
      )}

      <PageHeader
        title={schema?.displayName ?? 'Entries'}
        description={
          contentType
            ? (schema?.description ??
              `Everything written as ${schema?.displayName ?? contentType}.`)
            : 'Everything written, by content type.'
        }
        badge={
          contents ? (
            <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-[3px] font-mono text-[11px] font-medium tabular-nums">
              {contents.totalItems}
            </span>
          ) : null
        }
        actions={
          <Button asChild size="sm">
            <Link href={newEntryHref(contentType)}>
              <IconPlus />
              New entry
            </Link>
          </Button>
        }
      />

      {/*
        Every control filters server side. Filtering the twenty rows this page happens to hold
        while showing the server's total would be a control that lies about what it searched, which
        is why these waited for #440 rather than shipping against the old endpoint.
      */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <EntryTypeTabs types={tabTypes} />
        <EntryStatusChips
          chips={STATUS_FILTERS.map((f) => ({
            label: f.label,
            value: f.value,
          }))}
          value={status}
          counts={statusCounts}
          onChange={(v) => changeStatus(v as ContentStatus | undefined)}
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by title"
          aria-label="Search entries"
          className="h-[38px] w-full sm:ml-auto sm:w-[260px]"
        />
      </div>

      {selectedItems.length > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="bg-foreground text-background mb-3 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
        >
          <span className="flex-1 text-sm font-semibold">
            {selectedItems.length} selected
            {leftOutScheduled.length > 0 && (
              <span className="ml-2 text-xs font-normal opacity-80">
                {leftOutScheduled.length} scheduled left out
              </span>
            )}
            {leftOutLifecycle.length > 0 && (
              <span className="ml-2 text-xs font-normal opacity-80">
                {leftOutLifecycle.length} left out, their type has its own lifecycle
              </span>
            )}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={bulk.isPending || eligible.length === 0}
            onClick={() => moveSelected(ContentStatus.Published, 'published')}
          >
            Publish
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-background/40 text-background hover:bg-background/10 hover:text-background bg-transparent"
            disabled={bulk.isPending || eligible.length === 0}
            onClick={() => moveSelected(ContentStatus.Archived, 'archived')}
          >
            Archive
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-background hover:bg-background/10 hover:text-background opacity-80"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {(counts?.uncountedTypes?.length ?? 0) > 0 && (
        <p className="text-muted-foreground -mt-2 mb-4 text-[11px]">
          Excludes {counts!.uncountedTypes!.length}{' '}
          {counts!.uncountedTypes!.length === 1 ? 'type' : 'types'} from these counts, because their
          read rules need a check on each entry.
        </p>
      )}

      <TabsContent value={contentType ?? ALL_TYPES}>
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <ErrorState entity="content" onRetry={() => refetch()} />
        ) : !contents?.items.length ? (
          <EmptyState
            icon={IconContent}
            title={
              filtered
                ? 'No entries match'
                : contentType
                  ? `No ${contentType} entries yet`
                  : 'No entries yet'
            }
            description={
              filtered
                ? 'Nothing here matches the search or status filter. Clearing them brings the rest back.'
                : 'Entries hold your actual content, each one following the fields of its content type.'
            }
            action={
              <Button asChild size="sm">
                <Link href={newEntryHref(contentType)}>
                  <IconPlus />
                  New entry
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((group) => (
                    <TableRow key={group.id} className="hover:bg-background">
                      {group.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className={COLUMN_CLASSES[header.column.id]?.head}
                        >
                          {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="hover:bg-background cursor-pointer"
                      onClick={(e) => {
                        // The title is a real link, so keyboard users have a focusable target and
                        // the row is a convenience for the mouse. Without this guard a click on the
                        // link navigates twice.
                        // The select cell is all checkbox as far as a click goes, padding included.
                        if ((e.target as HTMLElement).closest('a, button, [data-cell="select"]'))
                          return;
                        router.push(`/content/${row.original.id}`);
                      }}
                    >
                      {row.getAllCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          data-cell={cell.column.id}
                          className={COLUMN_CLASSES[cell.column.id]?.cell}
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <PaginationControls
              page={contents}
              onPageChange={(n) => setParams({ page: String(n) })}
            />
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

export default function ContentListPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ContentListInner />
    </Suspense>
  );
}
