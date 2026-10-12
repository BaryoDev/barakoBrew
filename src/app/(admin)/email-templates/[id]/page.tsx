'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { FieldDefinition } from 'barako-content-form';
import { useContent, useContents, useUpdateContent } from '@/hooks/use-contents';
import { useEmailLayouts, usePreviewEmailTemplate } from '@/hooks/use-email-templates';
import { useSchemas } from '@/hooks/use-schemas';
import { useWorkflowVariables } from '@/hooks/use-workflows';
import { apiErrorMessage } from '@/lib/api';
import { contentTitle } from '@/lib/content-title';
import { statusMeta } from '@/lib/status-vocabulary';
import type { ContentDetailRead } from '@/types/content';
import { EMAIL_LAYOUT_TYPE, EMAIL_TEMPLATE_TYPE } from '@/types/email-template';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { MarkdownField } from '@/components/content/markdown-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconEnvelope, IconEye } from '@/components/icons';

const SUBJECT_ID = 'et-subject';
const BODY_ID = 'et-body';
const NO_LAYOUT = '__none';
type InsertTarget = typeof SUBJECT_ID | typeof BODY_ID;

const BODY_FIELD = { name: BODY_ID, displayName: 'Body', type: 'markdown' } as FieldDefinition;

const PREVIEW_WIDTHS = { phone: '375px', desktop: '100%' } as const;
type PreviewWidth = keyof typeof PREVIEW_WIDTHS;

export default function EmailTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: entry, isLoading } = useContent(id);

  if (isLoading) return <TableSkeleton />;

  if (!entry || entry.contentType !== EMAIL_TEMPLATE_TYPE) {
    return (
      <EmptyState
        icon={IconEnvelope}
        title="Template not found"
        description="This email template does not exist, or it is not one you can read."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/email-templates">Back to email templates</Link>
          </Button>
        }
      />
    );
  }

  // Keyed on the version, so a save that the refetch brings back starts the form from what was stored.
  return <TemplateEditor key={`${entry.id}:${entry.version}`} entry={entry} />;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function TemplateEditor({ entry }: { entry: ContentDetailRead }) {
  const update = useUpdateContent();
  const { data: layouts } = useEmailLayouts();
  const [name, setName] = useState(text(entry.data.Name));
  const [subject, setSubject] = useState(text(entry.data.Subject));
  const [body, setBody] = useState(text(entry.data.Body));
  const [layout, setLayout] = useState(text(entry.data.Layout));
  const [target, setTarget] = useState<InsertTarget>(BODY_ID);
  const [entryType, setEntryType] = useState('');

  const dirty =
    name !== text(entry.data.Name) ||
    subject !== text(entry.data.Subject) ||
    body !== text(entry.data.Body) ||
    layout !== text(entry.data.Layout);
  const meta = statusMeta(entry.status);

  const insert = (placeholder: string) => {
    const element = document.getElementById(target) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    const current = target === SUBJECT_ID ? subject : body;
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + placeholder + current.slice(end);
    if (target === SUBJECT_ID) setSubject(next);
    else setBody(next);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  };

  const save = () => {
    const data: Record<string, unknown> = {
      ...entry.data,
      Name: name,
      Subject: subject,
      Body: body,
    };
    if (layout) data.Layout = layout;
    else delete data.Layout;
    update.mutate(
      {
        id: entry.id,
        data: { data, status: entry.status, version: entry.version },
        etag: entry.etag,
      },
      {
        onSuccess: () => toast.success('Template saved'),
        onError: (error) => toast.error(apiErrorMessage(error, 'The template could not be saved.')),
      }
    );
  };

  return (
    <>
      <PageHeader
        title={contentTitle(entry.data, entry.id)}
        description="Placeholders are filled from the entry a workflow runs on. Only a published template is sent."
        badge={<StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/content/${entry.id}`}>Open as an entry</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="et-name">Name</Label>
            <Input id="et-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={SUBJECT_ID}>Subject</Label>
            <Input
              id={SUBJECT_ID}
              value={subject}
              className="font-mono text-sm"
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <MarkdownField
              field={BODY_FIELD}
              label={<Label htmlFor={BODY_ID}>Body</Label>}
              value={body}
              onChange={(value) => setBody(text(value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="et-layout">Layout</Label>
            <Select
              value={layout || NO_LAYOUT}
              onValueChange={(v) => setLayout(v === NO_LAYOUT ? '' : v)}
            >
              <SelectTrigger id="et-layout" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LAYOUT}>The site settings (no layout)</SelectItem>
                {layout && !layouts?.items.some((l) => l.id === layout) && (
                  <SelectItem value={layout}>{layout}</SelectItem>
                )}
                {layouts?.items.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {contentTitle(l.data, l.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              A layout must be published. Layouts are entries of the{' '}
              <Link href={`/content?type=${EMAIL_LAYOUT_TYPE}`} className="underline">
                Email layout
              </Link>{' '}
              type.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={!dirty || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button asChild variant="ghost">
              <Link href="/email-templates">Back</Link>
            </Button>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <EntryTypePicker value={entryType} onChange={setEntryType} />
          <PlaceholderPicker
            contentType={entryType}
            target={target}
            onTarget={setTarget}
            onInsert={insert}
          />
          <PreviewPanel template={entry.id} contentType={entryType} dirty={dirty} />
        </div>
      </div>
    </>
  );
}

function EntryTypePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { data: schemas } = useSchemas();
  const types = (schemas ?? []).filter(
    (s) => s.name !== EMAIL_TEMPLATE_TYPE && s.name !== EMAIL_LAYOUT_TYPE
  );
  return (
    <div className="space-y-2">
      <Label htmlFor="et-entry-type">Sent for entries of type</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="et-entry-type" className="w-full">
          <SelectValue placeholder="Choose a content type" />
        </SelectTrigger>
        <SelectContent>
          {types.map((s) => (
            <SelectItem key={s.name} value={s.name}>
              {s.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-xs">
        Picks the placeholders on offer and the entries to preview against.
      </p>
    </div>
  );
}

function PlaceholderPicker({
  contentType,
  target,
  onTarget,
  onInsert,
}: {
  contentType: string;
  target: InsertTarget;
  onTarget: (target: InsertTarget) => void;
  onInsert: (placeholder: string) => void;
}) {
  const { data: variables } = useWorkflowVariables(contentType || undefined);
  if (!contentType || !variables) return null;
  const names = [
    ...variables.dataFields,
    ...variables.systemVariables,
    ...(variables.formats ?? []),
  ];
  if (names.length === 0) return null;

  return (
    <section aria-labelledby="et-placeholders" className="space-y-2">
      <h2 id="et-placeholders" className="text-sm font-medium">
        Placeholders
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <span id="et-insert-into" className="text-muted-foreground text-xs">
          Insert where the cursor was in the
        </span>
        <SegmentedControl
          aria-labelledby="et-insert-into"
          size="sm"
          value={target}
          onValueChange={(v) => onTarget(v as InsertTarget)}
        >
          <SegmentedControlItem value={SUBJECT_ID}>Subject</SegmentedControlItem>
          <SegmentedControlItem value={BODY_ID}>Body</SegmentedControlItem>
        </SegmentedControl>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {names.map((variable) => (
          <li key={variable.name}>
            <button
              type="button"
              title={variable.description}
              aria-label={`Insert ${variable.name}`}
              onClick={() => onInsert(variable.name)}
            >
              <Badge variant="secondary" className="hover:bg-accent font-mono font-normal">
                {variable.name}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PreviewPanel({
  template,
  contentType,
  dirty,
}: {
  template: string;
  contentType: string;
  dirty: boolean;
}) {
  const { data: entries } = useContents({ contentType, pageSize: 50 }, !!contentType);
  const preview = usePreviewEmailTemplate();
  const [entryId, setEntryId] = useState('');
  const [width, setWidth] = useState<PreviewWidth>('desktop');
  const result = preview.data;

  const run = () =>
    preview.mutate(
      { template, entryId },
      {
        onError: (error) =>
          toast.error(apiErrorMessage(error, 'The preview could not be rendered.')),
      }
    );

  return (
    <section aria-labelledby="et-preview" className="space-y-3 rounded-lg border p-4">
      <h2 id="et-preview" className="text-sm font-medium">
        Preview
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-2">
          <Label htmlFor="et-preview-entry">Against the entry</Label>
          <Select value={entryId} onValueChange={setEntryId} disabled={!contentType}>
            <SelectTrigger id="et-preview-entry" className="w-full">
              <SelectValue
                placeholder={contentType ? 'Choose an entry' : 'Choose a content type first'}
              />
            </SelectTrigger>
            <SelectContent>
              {entries?.items.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {contentTitle(e.data, e.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={run} disabled={!entryId || preview.isPending}>
          <IconEye className="size-3.5" />
          {preview.isPending ? 'Rendering…' : 'Preview'}
        </Button>
      </div>
      {dirty && (
        <p className="text-muted-foreground text-xs">
          The preview renders the saved template. Save to see your changes in it.
        </p>
      )}
      <p className="text-muted-foreground text-xs">Nothing is sent. The API has no test send.</p>

      {result && (
        <div className="space-y-3">
          {result.problem && (
            <p
              role="status"
              className="border-warning/40 bg-[var(--warning-soft)] text-warning rounded-lg border px-3 py-2 text-sm"
            >
              {result.problem}
            </p>
          )}
          {result.warnings.length > 0 && (
            <ul aria-label="Preview warnings" className="text-muted-foreground space-y-1 text-xs">
              {result.warnings.map((w, i) => (
                <li key={i}>
                  {w.field}: {w.message}
                </li>
              ))}
            </ul>
          )}
          {result.notes.length > 0 && (
            <ul aria-label="Preview notes" className="text-muted-foreground space-y-1 text-xs">
              {result.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
          {result.html && (
            <>
              <p className="text-sm">
                <span className="text-muted-foreground">Subject: </span>
                <span>{result.subject}</span>
              </p>
              <SegmentedControl
                aria-label="Preview width"
                size="sm"
                value={width}
                onValueChange={(v) => setWidth(v as PreviewWidth)}
              >
                <SegmentedControlItem value="phone">Phone</SegmentedControlItem>
                <SegmentedControlItem value="desktop">Desktop</SegmentedControlItem>
              </SegmentedControl>
              {/* No scripts and no same origin, so the rendered email cannot reach the console. */}
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={result.html}
                className="h-[32rem] w-full rounded-md border bg-white"
                style={{ maxWidth: PREVIEW_WIDTHS[width] }}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
