import { describe, it, expect } from 'vitest';
import type { WorkflowActionMetadata } from '@/types/workflow';
import { groupActions } from './workflow-action-groups';

function action(type: string, group?: string | null): WorkflowActionMetadata {
    const meta: WorkflowActionMetadata = { type, description: '', requiredParameters: [], exampleConfiguration: '{}' };
    return group === undefined ? meta : { ...meta, group };
}

describe('groupActions', () => {
    it('orders the groups Content, Delivery, Comms, Data, Flow whatever order the API lists them in', () => {
        const groups = groupActions([
            action('Conditional', 'Flow'),
            action('Email', 'Comms'),
            action('PostJournalEntry', 'Data'),
            action('Webhook', 'Delivery'),
            action('CreateTask', 'Content'),
        ]);

        expect(groups).toHaveLength(5);
        expect(groups.map((g) => g.name)).toEqual(['Content', 'Delivery', 'Comms', 'Data', 'Flow']);
    });

    it('keeps the API order inside a group and leaves out groups with no actions', () => {
        const groups = groupActions([
            action('SMS', 'Comms'),
            action('Request', 'Delivery'),
            action('Email', 'Comms'),
            action('Webhook', 'Delivery'),
        ]);

        expect(groups).toHaveLength(2);
        expect(groups.map((g) => [g.name, g.actions.map((a) => a.type)])).toEqual([
            ['Delivery', ['Request', 'Webhook']],
            ['Comms', ['SMS', 'Email']],
        ]);
    });

    it('puts an action with a null or unknown group under Other, last', () => {
        const groups = groupActions([
            action('ThrowingRunner', null),
            action('Email', 'Comms'),
            action('Mystery', 'Billing'),
            action('Conditional', 'Flow'),
        ]);

        expect(groups).toHaveLength(3);
        expect(groups.map((g) => [g.name, g.actions.map((a) => a.type)])).toEqual([
            ['Comms', ['Email']],
            ['Flow', ['Conditional']],
            ['Other', ['ThrowingRunner', 'Mystery']],
        ]);
    });

    it('lists every action under Other when an older API sends no group at all', () => {
        const groups = groupActions([action('Webhook'), action('Email'), action('Conditional')]);

        expect(groups).toHaveLength(1);
        expect(groups[0].name).toBe('Other');
        expect(groups[0].actions.map((a) => a.type)).toEqual(['Webhook', 'Email', 'Conditional']);
    });

    it('returns no groups for no actions', () => {
        expect(groupActions([])).toEqual([]);
    });
});
