import { describe, expect, it } from 'vitest';
import { workflowsUsingTemplate } from './use-email-templates';
import type { WorkflowDefinition } from '@/types/workflow';

function workflow(name: string, parameters: Record<string, string>): WorkflowDefinition {
    return {
        id: name,
        name,
        triggerContentType: 'booking',
        triggerEvent: 'Created',
        conditions: {},
        actions: [{ type: 'Email', parameters }],
    };
}

describe('workflowsUsingTemplate', () => {
    const template = { id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', data: { Slug: 'welcome' } };

    it('finds a workflow naming the template by slug in any case, and one naming it by id', () => {
        const found = workflowsUsingTemplate(
            [
                workflow('By slug', { To: 'a@example.com', Template: 'Welcome' }),
                workflow('By id', { To: 'a@example.com', Template: template.id }),
                workflow('Another template', { To: 'a@example.com', Template: 'goodbye' }),
                workflow('Inline', { To: 'a@example.com', Subject: 'Hi', Body: 'welcome' }),
            ],
            template,
        );

        expect(found).toHaveLength(2);
        expect(found.map((w) => w.name)).toEqual(['By slug', 'By id']);
    });

    it('does not match every blank Template against a template with no slug', () => {
        const found = workflowsUsingTemplate([workflow('Blank', { To: 'a@example.com', Template: ' ' })], {
            id: template.id,
            data: {},
        });

        expect(found).toEqual([]);
    });
});
