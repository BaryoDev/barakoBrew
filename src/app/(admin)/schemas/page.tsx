'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import { useSchemas } from '@/hooks/use-schemas';
import { useStoredPreference } from '@/hooks/use-stored-preference';
import { entriesHref, singletonHref } from '@/lib/navigation';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
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
import { IconContentTypes, IconCube, IconList, IconPlus, IconSearch } from '@/components/icons';
import type { ContentTypeDefinition } from '@/types/schema';

const VIEWS = ['cards', 'list'] as const;
type View = (typeof VIEWS)[number];

const SORTS = ['name', 'fields', 'updated'] as const;
type Sort = (typeof SORTS)[number];

const SORT_LABELS: Record<Sort, string> = {
  name: 'Name',
  fields: 'Field count',
  updated: 'Last edited',
};

const VIEW_KEY = 'barako_content_types_view';

/** 10.5px, 800, uppercase, on the sunken tint. The Signal column head. */
const HEAD =
  'h-auto bg-background py-3 text-[10.5px] font-extrabold tracking-[0.12em] uppercase text-[var(--faint)]';

/**
 * Where a content type is opened from this screen.
 *
 * Its entries, which is what somebody who came here to write is after. The fields are a second
 * link, because designing a type and filling one in are different jobs and only one of them is
 * done daily. A type holding a single entry has no list, so it opens that entry.
 */
function openHref(schema: ContentTypeDefinition): string {
  return schema.isSingleton === true ? singletonHref(schema.name) : entriesHref(schema.name);
}

function lastEdited(schema: ContentTypeDefinition): string | null {
  const at = schema.updatedAt ?? schema.createdAt;
  if (!at) return null;
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? null : formatDistanceToNowStrict(date, { addSuffix: true });
}

function TypeBadges({ schema }: { schema: ContentTypeDefinition }) {
  return (
    <>
      {schema.isSingleton === true && (
        <StatusBadge tone="muted" dot={false}>
          Single entry
        </StatusBadge>
      )}
      {schema.isPubliclyDeliverable === true && (
        <StatusBadge tone="accent" dot={false}>
          Public
        </StatusBadge>
      )}
    </>
  );
}

export default function SchemasPage() {
  const { data: schemas, isLoading, isError, refetch } = useSchemas();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const [view, setView] = useStoredPreference<View>(VIEW_KEY, VIEWS, 'cards');

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matching = (schemas ?? []).filter(
      (s) =>
        s.displayName.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle)
    );

    // Sorted on a copy: the array is the query cache's, and sorting it in place reorders what every
    // other screen reading the same key sees.
    return [...matching].sort((a, b) => {
      if (sort === 'fields') return b.fields.length - a.fields.length;
      if (sort === 'updated') {
        // A type the API did not date sorts last rather than first, which is what a 0 timestamp
        // would do to it.
        const at = (s: ContentTypeDefinition) => new Date(s.updatedAt ?? s.createdAt ?? 0).getTime() || 0;
        return at(b) - at(a);
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }, [schemas, search, sort]);

  return (
    <>
      <PageHeader
        title="Content types"
        description="The shapes your content can take. Open one to write its entries."
        actions={
          <Button asChild size="sm">
            <Link href="/schemas/new">
              <IconPlus />
              New content type
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState entity="content types" onRetry={() => refetch()} />
      ) : !schemas?.length ? (
        <EmptyState
          icon={IconContentTypes}
          title="No content types yet"
          description="A content type defines the fields every entry of that type will have, like Post, Product, or Event."
          action={
            <Button asChild size="sm">
              <Link href="/schemas/new">
                <IconPlus />
                New content type
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-[280px]">
              <IconSearch className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
              <Input
                type="search"
                placeholder="Search content types"
                aria-label="Search content types"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-[38px] pl-9"
              />
            </div>

            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger className="h-[38px] w-44" aria-label="Sort content types">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {SORT_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <SegmentedControl
              aria-label="How to show content types"
              className="h-[38px]"
              value={view}
              onValueChange={(v) => setView(v as View)}
            >
              <SegmentedControlItem value="cards">
                <IconCube aria-hidden />
                Cards
              </SegmentedControlItem>
              <SegmentedControlItem value="list">
                <IconList aria-hidden />
                List
              </SegmentedControlItem>
            </SegmentedControl>
          </div>

          {filtered.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No content type matches “{search}”.
            </p>
          ) : view === 'cards' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((schema) => (
                <TypeCard key={schema.name} schema={schema} />
              ))}
            </div>
          ) : (
            <div className="bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-background">
                    <TableHead className={`${HEAD} pl-6`}>Type</TableHead>
                    <TableHead className={`${HEAD} hidden text-right sm:table-cell`}>Fields</TableHead>
                    <TableHead className={`${HEAD} hidden text-right md:table-cell`}>Edited</TableHead>
                    <TableHead className={`${HEAD} pr-6 text-right`}>Fields editor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((schema) => (
                    <TableRow key={schema.name} className="hover:bg-background">
                      <TableCell className="py-3.5 pl-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={openHref(schema)}
                            className="focus-visible:ring-ring truncate rounded-sm text-[13.5px] font-bold outline-none focus-visible:ring-[3px]"
                          >
                            {schema.displayName}
                          </Link>
                          <TypeBadges schema={schema} />
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden py-3.5 text-right font-mono text-[11.5px] tabular-nums sm:table-cell">
                        {schema.fields.length}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden py-3.5 text-right font-mono text-[11.5px] tabular-nums md:table-cell">
                        {lastEdited(schema) ?? ''}
                      </TableCell>
                      <TableCell className="py-3.5 pr-6 text-right">
                        <Link
                          href={`/schemas/${schema.name}`}
                          className="focus-visible:ring-ring text-muted-foreground hover:text-foreground rounded-sm text-xs outline-none focus-visible:ring-[3px]"
                        >
                          Fields
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </>
  );
}

/**
 * One type as a card.
 *
 * The card is a plain element with a stretched link over it rather than an anchor wrapping
 * everything, because the Fields link has to sit inside it and an anchor inside an anchor is not
 * markup a browser will keep. Two tab stops, one per destination.
 */
function TypeCard({ schema }: { schema: ContentTypeDefinition }) {
  const edited = lastEdited(schema);

  return (
    <div className="group hover:border-ring/40 relative rounded-lg border p-4 transition-colors">
      <div className="flex items-start gap-2.5">
        <IconContentTypes className="text-primary mt-0.5 size-4 shrink-0" />
        <Link
          href={openHref(schema)}
          className="focus-visible:ring-ring min-w-0 flex-1 rounded-sm text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:ring-[3px]"
        >
          <span className="block truncate">{schema.displayName}</span>
        </Link>
      </div>

      <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">
        {schema.description || `${schema.fields.length} ${schema.fields.length === 1 ? 'field' : 'fields'}`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <TypeBadges schema={schema} />
      </div>

      <div className="text-muted-foreground mt-3 flex items-center justify-between gap-2 text-xs">
        <span>{edited ? `Edited ${edited}` : `${schema.fields.length} fields`}</span>
        {/* Above the stretched link, so it is its own destination rather than part of the card. */}
        <Link
          href={`/schemas/${schema.name}`}
          className="focus-visible:ring-ring hover:text-foreground relative z-10 rounded-sm outline-none focus-visible:ring-[3px]"
        >
          Fields
        </Link>
      </div>
    </div>
  );
}
