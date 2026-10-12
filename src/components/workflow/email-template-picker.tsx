'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useCreateContent } from '@/hooks/use-contents';
import { templateSlug, useEmailTemplates } from '@/hooks/use-email-templates';
import { apiErrorMessage } from '@/lib/api';
import { contentTitle } from '@/lib/content-title';
import { ContentStatus } from '@/types/content';
import { EMAIL_TEMPLATE_TYPE, TEMPLATE_PARAMETER } from '@/types/email-template';
import type { WorkflowActionMetadata } from '@/types/workflow';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const INLINE = '__inline';

/** Whether this API's Email action takes a template. An API before email templates does not list one. */
export function takesTemplate(meta: WorkflowActionMetadata | undefined): boolean {
  return meta?.optionalParameters?.includes(TEMPLATE_PARAMETER) ?? false;
}

/**
 * The Email action's Template: none, so the action carries its own Subject and Body, or a template
 * named by its slug. An inline action with a subject and a body can be saved as a new template.
 */
export function EmailTemplatePicker({
  id,
  value,
  subject,
  body,
  onChange,
}: {
  id: string;
  value: string;
  subject: string;
  body: string;
  onChange: (template: string) => void;
}) {
  const { data } = useEmailTemplates();
  const templates = data?.items ?? [];
  const known = templates.some((t) => (templateSlug(t) || t.id) === value);
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        Template <span className="text-muted-foreground font-normal">(optional)</span>
      </Label>
      <Select value={value || INLINE} onValueChange={(v) => onChange(v === INLINE ? '' : v)}>
        <SelectTrigger id={id} className="w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={INLINE}>None, write the subject and body here</SelectItem>
          {value && !known && <SelectItem value={value}>{value}</SelectItem>}
          {templates.map((t) => (
            <SelectItem key={t.id} value={templateSlug(t) || t.id}>
              {contentTitle(t.data, t.id)}
              {t.status !== ContentStatus.Published
                ? ` (${t.status}, not sent until published)`
                : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-xs">
        {value ? 'The template supplies the subject and body. ' : ''}
        <Link href="/email-templates" className="underline">
          Edit templates
        </Link>
        {!value && subject.trim() && body.trim() && (
          <>
            {' or '}
            <button type="button" className="underline" onClick={() => setSaving(true)}>
              save this subject and body as a template
            </button>
          </>
        )}
        .
      </p>
      {saving && (
        <SaveAsTemplateDialog subject={subject} body={body} onClose={() => setSaving(false)} />
      )}
    </div>
  );
}

function SaveAsTemplateDialog({
  subject,
  body,
  onClose,
}: {
  subject: string;
  body: string;
  onClose: () => void;
}) {
  const create = useCreateContent();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const save = () =>
    create.mutate(
      {
        contentType: EMAIL_TEMPLATE_TYPE,
        status: ContentStatus.Draft,
        data: { Name: name.trim(), Slug: slug.trim(), Subject: subject, Body: body },
      },
      {
        onSuccess: () => {
          toast.success(
            `Saved "${name.trim()}" as a draft template. Publish it, then pick it here.`
          );
          onClose();
        },
        onError: (error) => toast.error(apiErrorMessage(error, 'The template could not be saved.')),
      }
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as a template</DialogTitle>
          <DialogDescription>
            Saved as a draft. This action keeps its own subject and body until you pick the
            template, which is sent only once it is published.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="save-template-name">Name</Label>
            <Input id="save-template-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="save-template-slug">Slug</Label>
            <Input
              id="save-template-slug"
              value={slug}
              className="font-mono text-xs"
              placeholder="welcome"
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!name.trim() || !slug.trim() || create.isPending}>
            {create.isPending ? 'Saving…' : 'Save template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
