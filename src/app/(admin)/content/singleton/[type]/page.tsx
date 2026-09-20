'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useSchemas } from '@/hooks/use-schemas';
import { useContents, useCreateContent } from '@/hooks/use-contents';
import { apiErrorMessage } from '@/lib/api';
import { ContentStatus } from '@/types/content';
import type { ContentTypeDefinition } from '@/types/schema';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { ContentEditor } from '@/components/content/content-editor';
import { DynamicForm } from '@/components/content/dynamic-form';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { IconContentTypes } from '@/components/icons';

/**
 * A single-entry type, as one edit screen.
 *
 * The entry is found through the list endpoint filtered by type, because that is the only way the
 * API offers to find it: there is no route by type. Oldest first and two rows, so a type that holds
 * more than one entry (an import can set the flag on a type that already has several) edits the
 * same one every time and says so, rather than picking whichever came back first.
 */
export default function SingletonEntryPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const name = decodeURIComponent(type);
  const router = useRouter();
  const { data: schemas, isLoading: schemasLoading } = useSchemas();
  const schema = schemas?.find((s) => s.name === name);
  const singleton = schema?.isSingleton === true;

  const {
    data: entries,
    isLoading: entriesLoading,
    isError,
    refetch,
  } = useContents({ contentType: name, page: 1, pageSize: 2, sortOrder: 'asc' }, singleton);

  // A type without the flag has a list, and the list is where it belongs.
  useEffect(() => {
    if (schema && !singleton) router.replace(`/content?type=${encodeURIComponent(schema.name)}`);
  }, [schema, singleton, router]);

  if (schemasLoading || (schema && !singleton)) return <TableSkeleton />;

  if (!schema) {
    return (
      <EmptyState
        icon={IconContentTypes}
        title="Content type not found"
        description={`No content type is named “${name}”, or your role cannot read it.`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/content">Back to entries</Link>
          </Button>
        }
      />
    );
  }

  if (entriesLoading) return <TableSkeleton />;
  if (isError || !entries) return <ErrorState entity="content" onRetry={() => refetch()} />;

  const entry = entries.items[0];
  if (!entry) return <FirstEntry schema={schema} onRefused={() => refetch()} />;

  return (
    <>
      {entries.totalItems > 1 && (
        <div
          role="alert"
          className="border-warning/40 bg-[var(--warning-soft)] text-warning mb-4 rounded-xl border px-4 py-3 text-sm font-semibold"
        >
          This type holds one entry, but {entries.totalItems} are stored. This screen edits the
          oldest. The others are listed under{' '}
          <Link href="/content" className="underline">
            Entries
          </Link>
          .
        </div>
      )}
      <ContentEditor key={entry.id} id={entry.id} heading={schema.displayName} backHref={null} />
    </>
  );
}

/** The form before the entry exists. The first save creates it, and the screen then edits it. */
function FirstEntry({
  schema,
  onRefused,
}: {
  schema: ContentTypeDefinition;
  onRefused: () => void;
}) {
  const { user } = useAuth();
  const createContent = useCreateContent();
  const [values, setValues] = useState<Record<string, unknown>>({});

  const submit = (status: ContentStatus) => {
    createContent.mutate(
      { contentType: schema.name, data: values, status },
      {
        onSuccess: () =>
          toast.success(status === ContentStatus.Published ? 'Published' : 'Draft saved'),
        onError: (error) => {
          // The likeliest refusal is someone else having created the entry since this screen
          // loaded. Reading the list again puts theirs on screen instead of this empty form.
          onRefused();
          toast.error(apiErrorMessage(error, 'The entry could not be saved.'));
        },
      }
    );
  };

  return (
    <>
      <PageHeader
        title={schema.displayName}
        description="Nothing saved yet. Saving creates the entry, and this screen edits it from then on."
      />
      <div className="max-w-2xl">
        <DynamicForm
            fields={schema.fields}
            values={values}
            onChange={setValues}
            contentType={schema.name}
            viewerRoles={user?.roles}
        />
        <Separator className="my-6" />
        <div className="flex items-center gap-2">
          <Button onClick={() => submit(ContentStatus.Published)} disabled={createContent.isPending}>
            Publish
          </Button>
          <Button
            variant="outline"
            onClick={() => submit(ContentStatus.Draft)}
            disabled={createContent.isPending}
          >
            Save as draft
          </Button>
        </div>
      </div>
    </>
  );
}
