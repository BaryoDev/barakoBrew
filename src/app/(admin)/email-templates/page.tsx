'use client';

import Link from 'next/link';
import {
  useEmailTemplates,
  templateSlug,
  workflowsUsingTemplate,
} from '@/hooks/use-email-templates';
import { useWorkflows } from '@/hooks/use-workflows';
import { contentTitle } from '@/lib/content-title';
import { statusMeta } from '@/lib/status-vocabulary';
import { EMAIL_TEMPLATE_TYPE } from '@/types/email-template';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IconEnvelope, IconPlus } from '@/components/icons';

const NEW_TEMPLATE_HREF = `/content/new?type=${EMAIL_TEMPLATE_TYPE}`;

export default function EmailTemplatesPage() {
  const { data, isLoading, isError, refetch } = useEmailTemplates();
  const { data: workflows } = useWorkflows();
  const templates = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Email templates"
        description="The subject and body an Email action sends when it names a template. Only a published template is sent."
        actions={
          <Button asChild size="sm">
            <Link href={NEW_TEMPLATE_HREF}>
              <IconPlus />
              New template
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState entity="email templates" onRetry={() => refetch()} />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={IconEnvelope}
          title="No email templates yet"
          description="Templates are entries of the Email template type, which the email blueprint adds under Content types."
          action={
            <Button asChild size="sm">
              <Link href={NEW_TEMPLATE_HREF}>
                <IconPlus />
                New template
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Used by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => {
                const meta = statusMeta(template.status);
                const users = workflowsUsingTemplate(workflows, template);
                return (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">
                      <Link href={`/email-templates/${template.id}`} className="hover:underline">
                        {contentTitle(template.data, template.id)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{templateSlug(template)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {users.length === 0 ? (
                        <span className="text-muted-foreground">No workflow</span>
                      ) : (
                        <ul
                          aria-label={`Workflows using ${contentTitle(template.data, template.id)}`}
                        >
                          {users.map((workflow) => (
                            <li key={workflow.id ?? workflow.name}>
                              {workflow.id ? (
                                <Link
                                  href={`/workflows/${workflow.id}`}
                                  className="hover:underline"
                                >
                                  {workflow.name}
                                </Link>
                              ) : (
                                workflow.name
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
