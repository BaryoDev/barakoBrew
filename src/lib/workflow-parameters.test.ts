import { describe, it, expect } from 'vitest';
import type { WorkflowActionMetadata } from '@/types/workflow';
import {
    isSecretParameter,
    optionalParameters,
    parameterFields,
    withoutBlankOptional,
} from './workflow-parameters';

// Copied from WebhookAction's [WorkflowActionMetadata] on barakoCMS master, as GET /api/workflows/actions returns it.
const WEBHOOK: WorkflowActionMetadata = {
    type: 'Webhook',
    description: 'Send HTTP POST requests to external webhooks, signed when a Secret is set',
    requiredParameters: ['Url'],
    exampleConfiguration:
        '{"Type":"Webhook","Parameters":{"Url":"https://example.com/webhook","Secret":"a shared secret, optional"}}',
};

const EMAIL: WorkflowActionMetadata = {
    type: 'Email',
    description: 'Send email notifications',
    requiredParameters: ['To', 'Subject', 'Body'],
    exampleConfiguration:
        '{"Type":"Email","Parameters":{"To":"admin@example.com","Subject":"Workflow Triggered","Body":"Content {{id}} was updated"}}',
};

describe('optionalParameters', () => {
    it('reads the Webhook Secret from the example, since the metadata lists only Url', () => {
        expect(optionalParameters(WEBHOOK)).toEqual(['Secret']);
    });

    it('finds none on an action whose example holds only required parameters', () => {
        expect(optionalParameters(EMAIL)).toEqual([]);
    });

    it('finds none, rather than throwing, when the example is not JSON', () => {
        expect(optionalParameters({ ...WEBHOOK, exampleConfiguration: 'not json' })).toEqual([]);
        expect(optionalParameters({ ...WEBHOOK, exampleConfiguration: '{"Parameters":[1]}' })).toEqual([]);
        expect(optionalParameters(undefined)).toEqual([]);
    });
});

describe('isSecretParameter', () => {
    it('matches the names the API redacts, whatever the case', () => {
        expect(['Secret', 'ApiKey', 'password', 'AccessToken', 'private_key'].map(isSecretParameter)).toEqual([
            true, true, true, true, true,
        ]);
    });

    it('leaves ordinary names alone', () => {
        expect(['Url', 'To', 'Subject'].map(isSecretParameter)).toEqual([false, false, false]);
    });
});

describe('parameterFields', () => {
    it('lists required parameters first, then optional ones, and marks the secret', () => {
        expect(parameterFields(WEBHOOK, { Url: '' })).toEqual([
            { name: 'Url', required: true, secret: false },
            { name: 'Secret', required: false, secret: true },
        ]);
    });
});

describe('withoutBlankOptional', () => {
    it('drops a blank Secret but keeps a blank required Url, so the validator can name it', () => {
        expect(withoutBlankOptional({ Url: '', Secret: '  ' }, WEBHOOK)).toEqual({ Url: '' });
    });

    it('keeps a Secret that was typed', () => {
        expect(withoutBlankOptional({ Url: 'https://a.example/hook', Secret: 's3cret' }, WEBHOOK)).toEqual({
            Url: 'https://a.example/hook',
            Secret: 's3cret',
        });
    });
});
