'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useSchema, useSetPublicDelivery } from '@/hooks/use-schemas';
import { fieldTypeLabel, resolveFieldType, type FieldDefinition } from '@/types/schema';
import { isChoiceField, optionLabel } from '@/lib/choice';
import { FieldOptionsDialog } from '@/components/schema/field-options-dialog';
import { FieldPresentationDialog } from '@/components/schema/field-presentation-dialog';
import { FieldCurrencyDialog } from '@/components/schema/field-currency-dialog';
import { RouteTemplatePanel } from '@/components/schema/route-template-panel';
import { UniquenessPanel } from '@/components/schema/uniqueness-panel';
import { PageHeader } from '@/components/patterns/page-header';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { EmptyState } from '@/components/patterns/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { singletonHref } from '@/lib/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IconContent, IconContentTypes, IconInfo, IconPlus } from '@/components/icons';

export default function SchemaDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const { data: schema, isLoading } = useSchema(name);
  const setPublicDelivery = useSetPublicDelivery(name);
  const [editingOptions, setEditingOptions] = useState<FieldDefinition | null>(null);
  const [editingPresentation, setEditingPresentation] = useState<FieldDefinition | null>(null);
  const [editingCurrency, setEditingCurrency] = useState<FieldDefinition | null>(null);

  if (isLoading) return <TableSkeleton />;

  if (!schema) {
    return (
      <EmptyState
        icon={IconContentTypes}
        title="Content type not found"
        description={`No content type is named “${name}”. It may have been created under a different slug.`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/schemas">Back to content types</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        title={schema.displayName}
        description={schema.description || `API name: ${schema.name}`}
        actions={
          schema.isSingleton ? (
            <Button asChild size="sm">
              <Link href={singletonHref(schema.name)}>
                <IconContent />
                Edit entry
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/content?type=${schema.name}`}>
                  <IconContent />
                  View entries
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/content/new?type=${schema.name}`}>
                  <IconPlus />
                  New entry
                </Link>
              </Button>
            </>
          )
        }
      />

      <div className="text-muted-foreground mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm">
        <IconInfo className="mt-0.5 size-4 shrink-0" />
        <p>
          A content type&rsquo;s fields are permanent: the API has no update or delete for them. To
          change the shape, create a new type and migrate entries. What you can change afterwards: public
          delivery, the path on the site, uniqueness rules, how each field is edited, the options of a
          choice field and the currency of a money field.
        </p>
      </div>

      <div className="mb-6 flex items-start justify-between gap-6 rounded-lg border p-4">
        <div className="space-y-1">
          <Label htmlFor="publicDelivery">Serve this type publicly</Label>
          <p className="text-muted-foreground text-sm">
            {schema.isPubliclyDeliverable ? (
              <>
                Anyone can read published entries of this type without signing in, at{' '}
                <code className="text-xs">/api/public/{schema.name}</code>. Fields marked sensitive
                stay hidden.
              </>
            ) : (
              <>
                Entries of this type are not served anonymously. Requests to{' '}
                <code className="text-xs">/api/public/{schema.name}</code> return 404. Turn this on
                for content meant for the public, like posts or pages — not for people or payments.
              </>
            )}
          </p>
        </div>
        <Switch
          id="publicDelivery"
          checked={schema.isPubliclyDeliverable ?? false}
          disabled={setPublicDelivery.isPending}
          onCheckedChange={(enabled) =>
            setPublicDelivery.mutate(enabled, {
              onSuccess: () =>
                toast.success(
                  enabled
                    ? `“${schema.displayName}” is now served publicly`
                    : `“${schema.displayName}” is no longer served publicly`,
                ),
              onError: () => toast.error('Could not change public delivery'),
            })
          }
        />
      </div>

      <RouteTemplatePanel
        key={schema.routeTemplate ?? ''}
        typeName={schema.name}
        current={schema.routeTemplate}
      />

      <UniquenessPanel schema={schema} />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>API name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Required</TableHead>
              <TableHead className="sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schema.fields.map((field) => (
              <TableRow key={field.name}>
                <TableCell className="font-medium">
                  {field.displayName}
                  {(field.section || field.editor || field.role) && (
                    <p className="text-muted-foreground text-xs font-normal">
                      {[
                        field.section && `Section ${field.section}`,
                        field.editor && `${field.editor} editor`,
                        field.role && `${field.role} role`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">{field.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-normal">
                    {fieldTypeLabel(field.type)}
                    {field.multiple ? ', several' : ''}
                    {field.currency ? ` in ${field.currency}` : ''}
                  </Badge>
                  {isChoiceField(field) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        {(field.options ?? []).map(optionLabel).join(', ')}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Edit options for ${field.displayName}`}
                        onClick={() => setEditingOptions(field)}
                      >
                        Edit options
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-right text-sm">
                  {field.isRequired ? 'Yes' : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {resolveFieldType(field.type) === 'money' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Currency for ${field.displayName}`}
                        onClick={() => setEditingCurrency(field)}
                      >
                        Currency
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`How ${field.displayName} is edited`}
                      onClick={() => setEditingPresentation(field)}
                    >
                      Editing
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editingPresentation && (
        <FieldPresentationDialog
          key={editingPresentation.name}
          typeName={schema.name}
          field={editingPresentation}
          open
          onOpenChange={(open) => {
            if (!open) setEditingPresentation(null);
          }}
        />
      )}

      {editingCurrency && (
        <FieldCurrencyDialog
          key={editingCurrency.name}
          typeName={schema.name}
          field={editingCurrency}
          open
          onOpenChange={(open) => {
            if (!open) setEditingCurrency(null);
          }}
        />
      )}

      {editingOptions && (
        <FieldOptionsDialog
          key={editingOptions.name}
          typeName={schema.name}
          field={editingOptions}
          open
          onOpenChange={(open) => {
            if (!open) setEditingOptions(null);
          }}
        />
      )}
    </>
  );
}
