'use client';

import { useQuery } from '@tanstack/react-query';
import { api, isNotFound, type Paginated } from '@/lib/api';
import { useCurrentTenant } from '@/hooks/use-tenants';

/**
 * One row of the delivery log: what a workflow's Webhook action or a connector Request action sent,
 * and what came back. Both lists read the same stored document, newest first, behind
 * `view_workflow_runs`; `responseBody` (and on a request row, `requestHeaders`) also needs
 * `view_webhook_response_bodies` and is null without it.
 */
export interface Delivery {
    id: string;
    workflowId: string;
    runId?: string | null;
    /** Scheme, host and port only. The API never stores the path or the query. */
    url: string;
    event: string;
    responseStatus?: number | null;
    responseBody?: string | null;
    responseBodyClearedAt?: string | null;
    durationMs: number;
    /** The API's own sentence: no response, a refusal before sending, or a success rule not met. */
    error?: string | null;
    attempt: number;
    createdAt: string;
    /** Request rows only. */
    connectorSlug?: string | null;
    requestSlug?: string | null;
    method?: string | null;
    /** Request rows only: what the sender sent for this one attempt, 2 after a token was renewed. */
    requestsSent?: number;
}

export type DeliveryKind = 'requests' | 'webhooks';

export const DELIVERY_PATHS: Record<DeliveryKind, string> = {
    requests: '/api/connector-deliveries',
    webhooks: '/api/webhook-deliveries',
};

/** The status classes both lists accept. Anything else is a 400. */
export const DELIVERY_STATUSES = ['2xx', '3xx', '4xx', '5xx', 'failed'] as const;

export const DELIVERIES_PAGE_SIZE = 25;

export interface DeliveriesQuery {
    kind: DeliveryKind;
    page: number;
    status?: string;
    /** Request rows only: a connector's slug. */
    connector?: string;
}

/** Only the filters that are set, so "every status" is not sent as an empty filter the API refuses. */
export function deliveryParams(query: DeliveriesQuery): Record<string, string | number> {
    const params: Record<string, string | number> = { page: query.page, pageSize: DELIVERIES_PAGE_SIZE };
    if (query.status && (DELIVERY_STATUSES as readonly string[]).includes(query.status)) params.status = query.status;
    if (query.kind === 'requests' && query.connector?.trim()) params.connector = query.connector.trim();
    return params;
}

export type DeliveriesState = { kind: 'absent' } | { kind: 'rows'; page: Paginated<Delivery> };

/** A 404 is an API without that list (connector deliveries arrived in barakoCMS 4.6). */
export function useDeliveries(query: DeliveriesQuery) {
    const tenant = useCurrentTenant();
    const params = deliveryParams(query);

    return useQuery({
        queryKey: ['deliveries', query.kind, params, tenant],
        queryFn: async (): Promise<DeliveriesState> => {
            try {
                const { data } = await api.get<Paginated<Delivery>>(DELIVERY_PATHS[query.kind], { params });
                return { kind: 'rows', page: data };
            } catch (error) {
                if (isNotFound(error)) return { kind: 'absent' };
                throw error;
            }
        },
    });
}

/** What a row was sent to, in the words the list shows. */
export function deliveryTarget(delivery: Delivery): string {
    if (delivery.connectorSlug || delivery.requestSlug) {
        const via = [delivery.connectorSlug, delivery.requestSlug].filter(Boolean).join(' / ');
        return delivery.method ? `${delivery.method} ${via}` : via;
    }
    return delivery.url;
}
