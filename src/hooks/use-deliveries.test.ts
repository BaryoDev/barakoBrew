import { describe, expect, it } from 'vitest';
import { DELIVERIES_PAGE_SIZE, deliveryParams, deliveryTarget, type Delivery } from './use-deliveries';

const row = (extra: Partial<Delivery> = {}): Delivery => ({
    id: 'd1',
    workflowId: 'w1',
    url: 'https://api.example.com',
    event: 'Created',
    durationMs: 12,
    attempt: 1,
    createdAt: '2026-10-03T10:00:00Z',
    ...extra,
});

describe('deliveryParams', () => {
    it('always sends a bounded page', () => {
        expect(deliveryParams({ kind: 'webhooks', page: 2 })).toEqual({ page: 2, pageSize: DELIVERIES_PAGE_SIZE });
    });

    it('sends a status class the API knows and drops one it would refuse', () => {
        expect(deliveryParams({ kind: 'requests', page: 1, status: '5xx' }).status).toBe('5xx');
        expect(deliveryParams({ kind: 'requests', page: 1, status: '' }).status).toBeUndefined();
        expect(deliveryParams({ kind: 'requests', page: 1, status: 'broken' }).status).toBeUndefined();
    });

    it('sends the connector for request deliveries only', () => {
        expect(deliveryParams({ kind: 'requests', page: 1, connector: ' crm ' }).connector).toBe('crm');
        expect(deliveryParams({ kind: 'webhooks', page: 1, connector: 'crm' }).connector).toBeUndefined();
    });
});

describe('deliveryTarget', () => {
    it('names the method, connector and request of a request row', () => {
        expect(deliveryTarget(row({ connectorSlug: 'crm', requestSlug: 'push-lead', method: 'POST' }))).toBe(
            'POST crm / push-lead',
        );
    });

    it('names the address of a webhook row', () => {
        expect(deliveryTarget(row())).toBe('https://api.example.com');
    });
});
