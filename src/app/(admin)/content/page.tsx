'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSchemas } from '@/hooks/use-schemas';
import { useContents } from '@/hooks/use-contents';
import { ContentStatus } from '@/types/content';
import { STATUS_ORDER, STATUS_VOCABULARY, statusFromParam, statusMeta } from '@/lib/status-vocabulary';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { StatusBadge } from '@/components/patterns/status-badge';
import { ErrorState } from '@/components/patterns/error-state';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { PaginationControls } from '@/components/patterns/pagination-controls';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
import { IconContent, IconLock, IconPlus } from '@/components/icons';
import { useDebounced } from '@/hooks/use-debounced';
import { formatDistanceToNowStrict } from 'date-fns';
import { contentTitle } from '@/lib/content-title';
import { singletonHref } from '@/lib/navigation';
import { IconChevronLeft } from '@/components/icons';

const ALL_TYPES = 'all';
const ALL_STATUSES = 'all';

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

/** 10.5px, 800, uppercase, on the sunken tint. The Signal column head. */
const HEAD =
  'h-auto bg-background py-3 text-[10.5px] font-extrabold tracking-[0.12em] uppercase text-[var(--faint)]';

/** Machine-produced cell values: mono, tabular, muted. Types, versions, timestamps. */
const META = 'text-muted-foreground font-mono text-[11.5px] tabular-nums';

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
      new Set(
        (schemas ?? []).filter((s) => s.isPubliclyDeliverable === false).map((s) => s.name)
      ),
    [schemas]
  );

  const setType = (value: string) => {
    setParams({ type: value === ALL_TYPES ? null : value, page: null });
  };

  const schema = schemas?.find((s) => s.name === contentType);

  return (
    <>
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
            : 'Everything written in your CMS, filterable by content type.'
        }
        badge={
          contents ? (
            <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-[3px] font-mono text-[11px] font-bold tabular-nums">
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
        All three controls filter server side. Filtering the twenty rows this page happens to hold
        while showing the server's total would be a control that lies about what it searched, which
        is why these waited for #440 rather than shipping against the old endpoint.
      */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entries"
          aria-label="Search entries"
          className="h-[38px] w-full sm:w-[280px]"
        />

        <SegmentedControl
          aria-label="Filter by status"
          className="h-[38px]"
          value={status ?? ALL_STATUSES}
          onValueChange={(v) => changeStatus(v === ALL_STATUSES ? undefined : (v as ContentStatus))}
        >
          {STATUS_FILTERS.map((option) => (
            <SegmentedControlItem key={option.label} value={option.value ?? ALL_STATUSES}>
              {option.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>

        <Select value={contentType ?? ALL_TYPES} onValueChange={setType}>
          {/* No visible label by design, so the name has to come from aria-label. The placeholder
              is not one: it disappears the moment a value is selected, and renders as nothing while
              the schema list is still loading, which is when axe caught this. */}
          <SelectTrigger className="h-[38px] w-56" aria-label="Filter by content type">
            <SelectValue placeholder="All content types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>All content types</SelectItem>
            {schemas?.map((s) => (
              <SelectItem key={s.name} value={s.name}>
                {s.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
                <TableRow className="hover:bg-background">
                  <TableHead className={`${HEAD} pl-6`}>Entry</TableHead>
                  <TableHead className={HEAD}>Type</TableHead>
                  <TableHead className={HEAD}>Status</TableHead>
                  <TableHead className={`${HEAD} hidden text-right md:table-cell`}>V</TableHead>
                  <TableHead className={`${HEAD} hidden pr-6 text-right sm:table-cell`}>
                    Updated
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contents.items.map((item) => {
                  const meta = statusMeta(item.status);
                  const href = `/content/${item.id}`;
                  return (
                    <TableRow
                      key={item.id}
                      className="hover:bg-background cursor-pointer"
                      onClick={(e) => {
                        // The title is a real link, so keyboard users have a focusable target and
                        // the row is a convenience for the mouse. Without this guard a click on the
                        // link navigates twice.
                        if ((e.target as HTMLElement).closest('a')) return;
                        router.push(href);
                      }}
                    >
                      <TableCell className="max-w-md py-3.5 pl-6">
                        <Link
                          href={href}
                          className="focus-visible:ring-ring block truncate text-[13.5px] font-bold rounded-sm outline-none focus-visible:ring-[3px]"
                        >
                          {contentTitle(item.data, item.id)}
                        </Link>
                      </TableCell>
                      <TableCell className={`${META} py-3.5`}>{item.contentType}</TableCell>
                      <TableCell className="py-3.5">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge tone={meta.tone} dot={false}>
                            {meta.label}
                          </StatusBadge>
                          {privateTypes.has(item.contentType) && (
                            <StatusBadge tone="accent" dot={false}>
                              <IconLock aria-hidden />
                              Private
                            </StatusBadge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={`${META} hidden py-3.5 text-right md:table-cell`}>
                        {/* Nothing, not a zero, when the server did not send one. A cell reading 0
                            is a claim about the entry; an empty one says the field was absent, which
                            is what happens against a pre-4.0 API. */}
                        {item.version === undefined ? '' : item.version}
                      </TableCell>
                      <TableCell className={`${META} hidden py-3.5 pr-6 text-right sm:table-cell`}>
                        {formatDistanceToNowStrict(new Date(item.updatedAt), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <PaginationControls page={contents} onPageChange={(n) => setParams({ page: String(n) })} />
        </>
      )}
    </>
  );
}

export default function ContentListPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ContentListInner />
    </Suspense>
  );
}
