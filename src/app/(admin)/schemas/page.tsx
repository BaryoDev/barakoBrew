'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDistanceToNowStrict } from 'date-fns';
import { useSchemas } from '@/hooks/use-schemas';
import { entriesHref, singletonHref } from '@/lib/navigation';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TypeIcon } from '@/components/schema/type-icon';
import { AddFieldPanel } from '@/components/schema/add-field-panel';
import { FieldSensitivityChip } from '@/components/schema/field-sensitivity-chip';
import { cn } from '@/lib/utils';
import { IconContentTypes, IconPlus, IconSearch } from '@/components/icons';
import { fieldTypeLabel, type ContentTypeDefinition } from '@/types/schema';

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

/** The field designer for a type. Encoded, since a name is data even when it usually looks safe. */
function fieldsHref(schema: ContentTypeDefinition): string {
  return `/schemas/${encodeURIComponent(schema.name)}`;
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

/**
 * Content types as the r3 canvas draws them: the types down the left, the selected one's fields on
 * the right. The selection is the `type` parameter, so a reload or a shared link opens the same
 * type. Under the lg breakpoint the two stack, the list first.
 */
export default function SchemasPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <SchemasInner />
    </Suspense>
  );
}

function SchemasInner() {
  const { data: schemas, isLoading, isError, refetch } = useSchemas();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    // Sorted on a copy: the array is the query cache's, and sorting it in place reorders what every
    // other screen reading the same key sees.
    return [...(schemas ?? [])]
      .filter(
        (s) => s.displayName.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle)
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [schemas, search]);

  // A name in the URL that no type has, such as a deleted one, falls back to the first rather than
  // leaving the right side empty.
  const wanted = searchParams.get('type');
  const selected = (schemas ?? []).find((s) => s.name === wanted) ?? filtered[0] ?? schemas?.[0];

  const select = (name: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('type', name);
    router.replace(`/schemas?${params.toString()}`, { scroll: false });
  };

  return (
    <>
      <PageHeader
        title="Content types"
        description="The shapes your content can take. Pick one to see its fields."
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
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
          <div className="bg-card grid gap-1 rounded-xl border p-2 shadow-[var(--shadow-card)]">
            <div className="relative mb-1">
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
            {filtered.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No content type matches “{search}”.
              </p>
            ) : (
              <ul className="grid gap-1" aria-label="Content types">
                {filtered.map((schema) => (
                  <li key={schema.name}>
                    <TypeRow
                      schema={schema}
                      selected={schema.name === selected?.name}
                      onSelect={() => select(schema.name)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selected && <TypeDetail schema={selected} allTypes={schemas} />}
        </div>
      )}
    </>
  );
}

/** One row of the list: icon tile, name, slug, field count. The selected row is tinted. */
function TypeRow({
  schema,
  selected,
  onSelect,
}: {
  schema: ContentTypeDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left outline-none focus-visible:ring-[3px]',
        selected ? 'bg-primary/10' : 'hover:bg-muted'
      )}
    >
      <span
        className={cn(
          'grid size-[30px] shrink-0 place-items-center rounded-lg',
          selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        <TypeIcon icon={schema.icon} fallback={IconContentTypes} className="size-4" aria-hidden />
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-[14.5px] font-semibold">{schema.displayName}</span>
        <span className="text-muted-foreground truncate font-mono text-[11.5px]">{schema.name}</span>
      </span>
      <span
        className="text-muted-foreground font-mono text-[11px] tabular-nums"
        aria-label={`${schema.fields.length} ${schema.fields.length === 1 ? 'field' : 'fields'}`}
      >
        {schema.fields.length}
      </span>
    </button>
  );
}

/**
 * The selected type: who it is, and its fields with Required and the sensitivity chip. The field
 * editor itself is the type's own screen, linked from the header; Add a field is the same panel
 * that screen uses.
 */
function TypeDetail({
  schema,
  allTypes,
}: {
  schema: ContentTypeDefinition;
  allTypes: ContentTypeDefinition[];
}) {
  const edited = lastEdited(schema);

  return (
    <section
      aria-label={`${schema.displayName} fields`}
      className="bg-card min-w-0 rounded-xl border p-5 shadow-[var(--shadow-card)]"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl border">
          <TypeIcon icon={schema.icon} fallback={IconContentTypes} className="size-[22px]" aria-hidden />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[22px] font-semibold tracking-tight">{schema.displayName}</h2>
            <TypeBadges schema={schema} />
          </div>
          <span className="text-muted-foreground font-mono text-[12.5px]">
            {schema.name}
            {edited ? ` · edited ${edited}` : ''}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={openHref(schema)}>Entries</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={fieldsHref(schema)}>Edit type</Link>
          </Button>
        </div>
      </div>

      {schema.description && (
        <p className="text-muted-foreground mb-4 text-sm">{schema.description}</p>
      )}

      <AddFieldPanel
        typeName={schema.name}
        fields={schema.fields}
        contentTypes={allTypes.map((t) => ({ name: t.name, displayName: t.displayName }))}
      />

      {schema.fields.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">This type has no fields yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-background">
                <TableHead className={cn(HEAD, 'pl-4')}>Field</TableHead>
                <TableHead className={HEAD}>Type</TableHead>
                <TableHead className={HEAD}>Required</TableHead>
                <TableHead className={cn(HEAD, 'pr-4')}>Sensitivity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schema.fields.map((field) => (
                <TableRow key={field.name} className="hover:bg-background">
                  <TableCell className="py-3 pl-4 font-mono text-[13px] font-medium">
                    {field.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground py-3 text-[13px]">
                    {fieldTypeLabel(field.type)}
                  </TableCell>
                  <TableCell className="text-muted-foreground py-3 text-[12px] font-semibold">
                    {field.isRequired ? 'Required' : 'Optional'}
                  </TableCell>
                  <TableCell className="py-3 pr-4">
                    <FieldSensitivityChip schema={schema} field={field} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
