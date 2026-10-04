'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    DELIVERY_STATUSES,
    deliveryTarget,
    useDeliveries,
    type Delivery,
    type DeliveryKind,
} from '@/hooks/use-deliveries';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { PaginationControls } from '@/components/patterns/pagination-controls';
import { StatusBadge, type Tone } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconRefresh, IconWebhook } from '@/components/icons';

const SELECT = 'h-9 rounded-md border bg-transparent px-3 text-sm';
const ANY = 'any';

function toneFor(status: number | null | undefined): Tone {
    if (status === null || status === undefined) return 'destructive';
    if (status >= 200 && status < 300) return 'success';
    if (status >= 400) return 'destructive';
    return 'warning';
}

function formatMoment(value: string): string {
    const at = new Date(value);
    return Number.isNaN(at.getTime()) ? '' : at.toLocaleString();
}

function kindFrom(value: string | null): DeliveryKind {
    return value === 'webhooks' ? 'webhooks' : 'requests';
}

function DeliveryRow({ delivery, kind }: { delivery: Delivery; kind: DeliveryKind }) {
    const attempts =
        kind === 'requests' && typeof delivery.requestsSent === 'number'
            ? `attempt ${delivery.attempt}, ${delivery.requestsSent} sent`
            : `attempt ${delivery.attempt}`;

    return (
        <TableRow>
            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatMoment(delivery.createdAt)}</TableCell>
            <TableCell>
                <StatusBadge tone={toneFor(delivery.responseStatus)}>
                    {delivery.responseStatus ?? 'No response'}
                </StatusBadge>
            </TableCell>
            <TableCell className="max-w-64">
                <span className="block truncate font-mono text-xs">{deliveryTarget(delivery)}</span>
                {kind === 'requests' && <span className="text-muted-foreground block truncate font-mono text-xs">{delivery.url}</span>}
            </TableCell>
            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{attempts}</TableCell>
            <TableCell className="max-w-80 text-xs">
                {delivery.error ? <span className="break-words">{delivery.error}</span> : <span className="text-muted-foreground">None</span>}
                {delivery.responseBody ? (
                    <details className="mt-1">
                        <summary className="text-muted-foreground cursor-pointer">Response body</summary>
                        <pre className="bg-muted mt-1 max-h-48 overflow-auto rounded p-2 font-mono text-[11px] whitespace-pre-wrap">
                            {delivery.responseBody}
                        </pre>
                    </details>
                ) : delivery.responseBodyClearedAt ? (
                    <span className="text-muted-foreground mt-1 block">Response body cleared by retention.</span>
                ) : null}
            </TableCell>
        </TableRow>
    );
}

function DeliveriesInner() {
    const searchParams = useSearchParams();
    const [kind, setKind] = useState<DeliveryKind>(kindFrom(searchParams.get('kind')));
    const [connector, setConnector] = useState(searchParams.get('connector') ?? '');
    const [status, setStatus] = useState<string>(ANY);
    const [page, setPage] = useState(1);

    const deliveries = useDeliveries({ kind, page, status: status === ANY ? undefined : status, connector });

    return (
        <div className="space-y-4">
            <PageHeader
                title="Deliveries"
                description="What workflow actions sent, newest first: requests through a connector, and webhooks. Request headers and response bodies need the capability to read response bodies."
                actions={
                    <Button variant="outline" size="sm" disabled={deliveries.isFetching} onClick={() => void deliveries.refetch()}>
                        <IconRefresh />
                        Refresh
                    </Button>
                }
            />

            <div className="flex flex-wrap items-end gap-3">
                <SegmentedControl
                    aria-label="Which deliveries"
                    size="sm"
                    value={kind}
                    onValueChange={(value) => {
                        setKind(kindFrom(value));
                        setPage(1);
                    }}
                >
                    <SegmentedControlItem value="requests">Requests</SegmentedControlItem>
                    <SegmentedControlItem value="webhooks">Webhooks</SegmentedControlItem>
                </SegmentedControl>

                <div className="space-y-1.5">
                    <Label htmlFor="deliveries-status">Status</Label>
                    <select
                        id="deliveries-status"
                        className={SELECT}
                        value={status}
                        onChange={(e) => {
                            setStatus(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value={ANY}>Any status</option>
                        {DELIVERY_STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {s === 'failed' ? 'No response' : s}
                            </option>
                        ))}
                    </select>
                </div>

                {kind === 'requests' && (
                    <div className="space-y-1.5">
                        <Label htmlFor="deliveries-connector">Connector slug</Label>
                        <Input
                            id="deliveries-connector"
                            className="h-9 w-48 font-mono text-xs"
                            value={connector}
                            placeholder="Every connector"
                            onChange={(e) => {
                                setConnector(e.target.value);
                                setPage(1);
                            }}
                        />
                    </div>
                )}
            </div>

            {deliveries.isLoading ? (
                <TableSkeleton />
            ) : deliveries.isError ? (
                <ErrorState entity="deliveries" onRetry={() => void deliveries.refetch()} />
            ) : deliveries.data?.kind === 'absent' ? (
                <EmptyState
                    icon={IconWebhook}
                    title="This API does not list these"
                    description={
                        kind === 'requests'
                            ? 'Request deliveries arrived in barakoCMS 4.6. An older API records only whether the run passed.'
                            : 'This API answers 404 for the webhook delivery list.'
                    }
                />
            ) : deliveries.data?.kind === 'rows' && deliveries.data.page.items.length === 0 ? (
                <EmptyState
                    icon={IconWebhook}
                    title="No deliveries to show"
                    description="A row appears each time a workflow action sends. Rows are removed by the retention the API is set to."
                />
            ) : deliveries.data?.kind === 'rows' ? (
                <>
                    <div className="overflow-x-auto rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>When</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Sent to</TableHead>
                                    <TableHead>Attempt</TableHead>
                                    <TableHead>Error</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {deliveries.data.page.items.map((delivery) => (
                                    <DeliveryRow key={delivery.id} delivery={delivery} kind={kind} />
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <PaginationControls page={deliveries.data.page} onPageChange={setPage} />
                </>
            ) : null}
        </div>
    );
}

export default function DeliveriesPage() {
    return (
        <Suspense fallback={<TableSkeleton />}>
            <DeliveriesInner />
        </Suspense>
    );
}
