import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useContents } from '@/hooks/use-contents';
import type { ContentListItem } from '@/types/content';
import type { WorkflowDefinition } from '@/types/workflow';
import {
    EMAIL_LAYOUT_TYPE,
    EMAIL_TEMPLATE_TYPE,
    TEMPLATE_PARAMETER,
    type EmailTemplatePreview,
} from '@/types/email-template';

/** The page size the list asks for. A tenant with more templates than this pages past it. */
const TEMPLATE_PAGE_SIZE = 100;

export function useEmailTemplates() {
    return useContents({ contentType: EMAIL_TEMPLATE_TYPE, pageSize: TEMPLATE_PAGE_SIZE });
}

export function useEmailLayouts() {
    return useContents({ contentType: EMAIL_LAYOUT_TYPE, pageSize: TEMPLATE_PAGE_SIZE });
}

/** Renders the saved template against an entry. Sends nothing; the API has no test send. */
export function usePreviewEmailTemplate() {
    return useMutation({
        mutationFn: async (input: { template: string; entryId: string }) => {
            const response = await api.post<EmailTemplatePreview>(
                `/api/email-templates/${encodeURIComponent(input.template)}/preview`,
                { entryId: input.entryId },
            );
            return response.data;
        },
    });
}

export function templateSlug(template: Pick<ContentListItem, 'data'>): string {
    const slug = template.data.Slug;
    return typeof slug === 'string' ? slug : '';
}

/**
 * The workflows whose own Email actions name this template. A workflow names one by id or by slug,
 * and the API matches a slug without regard to case, so this does too. A Conditional's children are
 * not read, the same limit the API's own save check has.
 */
export function workflowsUsingTemplate(
    workflows: WorkflowDefinition[] | undefined,
    template: Pick<ContentListItem, 'id' | 'data'>,
): WorkflowDefinition[] {
    const slug = templateSlug(template).toLowerCase();
    return (workflows ?? []).filter((workflow) =>
        workflow.actions.some((action) => {
            const named = action.parameters[TEMPLATE_PARAMETER]?.trim();
            if (!named) return false;
            return named === template.id || (slug !== '' && named.toLowerCase() === slug);
        }),
    );
}
