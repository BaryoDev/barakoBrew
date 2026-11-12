'use client';

import type { ReactNode } from 'react';
import { useAccounts, accountTypeLabel } from '@/hooks/use-accounting';
import { useClientErrors, useResolveClientError } from '@/hooks/use-errors';
import { useFeatureFlags, useToggleFeatureFlag } from '@/hooks/use-feature-flags';
import { deleteRefusal, useDeleteFile, useFiles, FILES_PAGE_SIZE } from '@/hooks/use-files';
import { useForms, useSetForm } from '@/hooks/use-forms';
import { formatBytes } from '@/lib/files';
import { MODULE } from '@/types/modules';
import { ModuleBody, type ModuleBodyProps, type ModuleRow, type TableState } from './module-table';

/**
 * What each module's table shows, and the calls behind it. Only a module whose list endpoint is
 * confirmed in the core source has an adapter here; any other module gets the same template with
 * an honest empty state, never a row the API did not send.
 */
type Adapter = (props: { side: ReactNode }) => ReactNode;

const UNREADABLE: TableState = { kind: 'message', text: 'The API sent a list this console cannot read.' };
const FAILED: TableState = { kind: 'message', text: 'Could not load this list.' };

function shown(value: string | null | undefined): string {
    return value && value.trim() ? value : 'None';
}

function date(value: string | null | undefined): string {
    if (!value) return 'Never';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'Never' : d.toISOString().slice(0, 10);
}

const DIAGNOSTICS_PAGE_SIZE = 25;
const ACCOUNTS_PAGE_SIZE = 100;

/** The note under a list that shows only its first page. */
function truncated(shownCount: number, total: number, where = ''): ReactNode {
    if (total <= shownCount) return undefined;
    return (
        <p className="text-muted-foreground pt-3 text-xs">
            Showing the first {shownCount} of {total}.{where ? ` ${where}` : ''}
        </p>
    );
}

/** The toast text for a failed file delete. A refusal says how many entries still use the file. */
export function removeFailure(error: unknown): string | null {
    const refusal = deleteRefusal(error);
    if (!refusal) return null;
    return refusal.message || `This file is used by ${refusal.total} ${refusal.total === 1 ? 'entry' : 'entries'}.`;
}

function stateOf(
    q: { isLoading: boolean; isError: boolean },
    readable: boolean,
): TableState | undefined {
    if (q.isLoading) return { kind: 'loading' };
    if (q.isError) return FAILED;
    if (!readable) return UNREADABLE;
    return undefined;
}

const FeatureFlagsBody: Adapter = ({ side }) => {
    const q = useFeatureFlags();
    const toggle = useToggleFeatureFlag();
    const list = Array.isArray(q.data) ? q.data : null;
    const rows: ModuleRow[] = (list ?? []).map((f) => ({
        id: f.key,
        title: f.key,
        on: f.enabled,
        sort: { updated: f.updatedAt },
        cells: { key: f.key, rollout: f.rolloutPercent ?? 0, updated: date(f.updatedAt), enabled: f.enabled ? 'On' : 'Off' },
        fields: [
            { label: 'Description', value: shown(f.description) },
            { label: 'State', value: f.enabled ? 'On' : 'Off', tone: f.enabled ? 'success' : 'muted' },
            { label: 'Rollout', value: `${f.rolloutPercent ?? 0}%` },
            { label: 'Tenants', value: shown((f.tenantSlugs ?? []).join(', ')) },
            { label: 'Users', value: shown((f.userEmails ?? []).join(', ')) },
            { label: 'Updated', value: date(f.updatedAt) },
        ],
        actions: [{ kind: 'toggle', label: f.enabled ? 'Turn off' : 'Turn on' }],
    }));
    const on = rows.filter((r) => r.on).length;
    return (
        <ModuleBody
            moduleLabel="Feature flags"
            title="Flags"
            noun="flags"
            side={side}
            stats={[
                { label: 'Flags', value: rows.length },
                { label: 'On', value: on },
                { label: 'Off', value: rows.length - on },
            ]}
            columns={[
                { key: 'key', label: 'Flag', kind: 'mono' },
                { key: 'rollout', label: 'Rollout', kind: 'number', format: (v) => `${v}%` },
                { key: 'updated', label: 'Updated', kind: 'date' },
                { key: 'enabled', label: 'State', kind: 'switch' },
            ]}
            rows={rows}
            state={stateOf(q, list !== null)}
            callFor={(r) => `POST /api/feature-flags/admin/${encodeURIComponent(r.id)}/toggle`}
            onToggle={(r) => toggle.mutateAsync(r.id)}
        />
    );
};

const FormsBody: Adapter = ({ side }) => {
    const q = useForms();
    const set = useSetForm();
    const absent = q.data?.kind === 'absent';
    const forms = q.data?.kind === 'forms' && Array.isArray(q.data.forms) ? q.data.forms : null;
    const rows: ModuleRow[] = (forms ?? []).map((f) => ({
        id: f.contentType,
        title: f.contentType,
        on: f.enabled,
        cells: { type: f.contentType, verifies: shown(f.verifyEmailField), enabled: f.enabled ? 'On' : 'Off' },
        fields: [
            { label: 'Accepting submissions', value: f.enabled ? 'On' : 'Off', tone: f.enabled ? 'success' : 'muted' },
            { label: 'Verifies email field', value: shown(f.verifyEmailField) },
            { label: 'Enabled since', value: date(f.enabledAt) },
        ],
        actions: [{ kind: 'toggle', label: f.enabled ? 'Stop accepting' : 'Accept submissions' }],
    }));
    const on = rows.filter((r) => r.on).length;
    return (
        <ModuleBody
            moduleLabel="Forms"
            title="Forms"
            noun="forms"
            side={side}
            stats={[
                { label: 'Forms', value: rows.length },
                { label: 'Accepting', value: on },
                { label: 'Closed', value: rows.length - on },
            ]}
            columns={[
                { key: 'type', label: 'Content type', kind: 'mono' },
                { key: 'verifies', label: 'Verifies email' },
                { key: 'enabled', label: 'Accepting', kind: 'switch' },
            ]}
            rows={rows}
            state={absent ? { kind: 'message', text: 'This deployment does not serve the Forms API.' } : stateOf(q, forms !== null)}
            callFor={(r) => `PUT /api/forms/${encodeURIComponent(r.id)}`}
            onToggle={(r, next) => set.mutateAsync({ contentType: r.id, enabled: next })}
        />
    );
};

const FilesBody: Adapter = ({ side }) => {
    const q = useFiles(1);
    const del = useDeleteFile();
    const items = Array.isArray(q.data?.items) ? q.data.items : null;
    const total = typeof q.data?.totalItems === 'number' ? q.data.totalItems : (items?.length ?? 0);
    const rows: ModuleRow[] = (items ?? []).map((f) => ({
        id: f.id,
        title: f.fileName,
        cells: {
            name: f.fileName,
            type: f.contentType,
            size: f.size,
            access: f.isPublic ? 'Public' : 'Private',
            uploaded: date(f.createdAt),
        },
        fields: [
            { label: 'Type', value: f.contentType },
            { label: 'Size', value: formatBytes(f.size) },
            { label: 'Access', value: f.isPublic ? 'Public' : 'Private' },
            { label: 'Uploaded', value: date(f.createdAt) },
            { label: 'Alt text', value: shown(f.alt) },
        ],
        actions: [{ kind: 'remove', label: 'Remove', commit: () => del.mutateAsync({ id: f.id }), failure: removeFailure }],
    }));
    const bytes = (items ?? []).reduce((n, f) => n + (f.size || 0), 0);
    return (
        <ModuleBody
            moduleLabel="Files"
            title="Files"
            noun="files"
            side={side}
            stats={[
                { label: 'Files', value: total },
                { label: 'On this page', value: formatBytes(bytes) },
                { label: 'Public', value: rows.filter((r) => r.cells.access === 'Public').length },
            ]}
            columns={[
                { key: 'name', label: 'Name' },
                { key: 'type', label: 'Type', kind: 'mono' },
                { key: 'size', label: 'Size', kind: 'number', format: (v) => formatBytes(Number(v)) },
                { key: 'access', label: 'Access' },
            ]}
            rows={rows}
            state={stateOf(q, items !== null)}
            callFor={(r) => `DELETE /api/files/${encodeURIComponent(r.id)}`}
            footer={truncated(FILES_PAGE_SIZE, total, 'Open Files in the sidebar for every page.')}
        />
    );
};

const DiagnosticsBody: Adapter = ({ side }) => {
    const q = useClientErrors({ page: 1, pageSize: DIAGNOSTICS_PAGE_SIZE });
    const resolve = useResolveClientError();
    const items = Array.isArray(q.data?.items) ? q.data.items : null;
    const rows: ModuleRow[] = (items ?? []).map((e) => {
        const status = e.resolved ? 'Resolved' : 'Open';
        return {
            id: e.id,
            title: e.message,
            sort: { last: e.lastSeenAt },
            cells: { message: e.message, severity: e.severity, count: e.count, last: date(e.lastSeenAt), status },
            fields: [
                { label: 'Status', value: status, tone: e.resolved ? 'success' : 'warning' },
                { label: 'Severity', value: e.severity },
                { label: 'Seen', value: `${e.count} times` },
                { label: 'First seen', value: date(e.firstSeenAt) },
                { label: 'Last seen', value: date(e.lastSeenAt) },
                { label: 'Source', value: shown(e.source) },
            ],
            actions: e.resolved
                ? []
                : [{ kind: 'run', label: 'Resolve', done: 'Marked as resolved', run: () => resolve.mutateAsync({ id: e.id }) }],
        };
    });
    return (
        <ModuleBody
            moduleLabel="Diagnostics"
            title="Errors"
            noun="errors"
            side={side}
            stats={[
                { label: 'Errors', value: q.data?.totalItems ?? rows.length },
                { label: 'Open on this page', value: rows.filter((r) => r.cells.status === 'Open').length },
                { label: 'Resolved on this page', value: rows.filter((r) => r.cells.status === 'Resolved').length },
            ]}
            columns={[
                { key: 'message', label: 'Message' },
                { key: 'count', label: 'Count', kind: 'number' },
                { key: 'last', label: 'Last seen', kind: 'date' },
                { key: 'status', label: 'Status', kind: 'status' },
            ]}
            rows={rows}
            state={stateOf(q, items !== null)}
            callFor={(r) => `POST /api/client-errors/${encodeURIComponent(r.id)}/resolve`}
            footer={truncated(DIAGNOSTICS_PAGE_SIZE, q.data?.totalItems ?? rows.length)}
        />
    );
};

const AccountingBody: Adapter = ({ side }) => {
    const q = useAccounts({ pageSize: ACCOUNTS_PAGE_SIZE });
    const list = Array.isArray(q.data) ? q.data : null;
    const rows: ModuleRow[] = (list ?? []).map((a) => {
        const status = a.isActive ? 'Active' : 'Inactive';
        return {
            id: a.code,
            title: `${a.code} ${a.name}`,
            cells: { code: a.code, name: a.name, type: accountTypeLabel(a.type), status },
            fields: [
                { label: 'Code', value: a.code },
                { label: 'Name', value: a.name },
                { label: 'Type', value: accountTypeLabel(a.type) },
                { label: 'Status', value: status, tone: a.isActive ? 'success' : 'muted' },
                { label: 'Parent', value: shown(a.parentCode) },
            ],
        };
    });
    return (
        <ModuleBody
            moduleLabel="Accounting"
            title="Accounts"
            noun="accounts"
            side={side}
            stats={[
                { label: 'Accounts', value: rows.length },
                { label: 'Active', value: rows.filter((r) => r.cells.status === 'Active').length },
                { label: 'Inactive', value: rows.filter((r) => r.cells.status === 'Inactive').length },
            ]}
            columns={[
                { key: 'code', label: 'Code', kind: 'mono' },
                { key: 'name', label: 'Name' },
                { key: 'type', label: 'Type' },
                { key: 'status', label: 'Status', kind: 'status' },
            ]}
            rows={rows}
            state={stateOf(q, list !== null)}
            callFor={() => 'GET /api/accounting/accounts'}
            footer={
                rows.length === ACCOUNTS_PAGE_SIZE ? (
                    <p className="text-muted-foreground pt-3 text-xs">
                        Showing the first {ACCOUNTS_PAGE_SIZE} accounts. There may be more.
                    </p>
                ) : undefined
            }
        />
    );
};

const ADAPTERS: Record<string, Adapter> = {
    [MODULE.featureFlags]: FeatureFlagsBody,
    [MODULE.forms]: FormsBody,
    [MODULE.files]: FilesBody,
    Diagnostics: DiagnosticsBody,
    [MODULE.accounting]: AccountingBody,
};

export function hasAdapter(name: string): boolean {
    return name in ADAPTERS;
}

export function ModuleAdapterBody({ name, side }: { name: string; side: ReactNode }) {
    const Body = ADAPTERS[name];
    if (Body) return <>{Body({ side })}</>;
    return <EmptyModuleBody side={side} />;
}

/** A module with no confirmed list endpoint: the template, with a plain statement and no rows. */
export function EmptyModuleBody({ side }: { side: ReactNode }) {
    const props: ModuleBodyProps = {
        moduleLabel: 'Module',
        title: 'Items',
        noun: 'items',
        side,
        stats: [
            { label: 'Items', value: '-' },
            { label: 'Active', value: '-' },
            { label: 'Needs attention', value: '-' },
        ],
        columns: [],
        rows: [],
        state: { kind: 'message', text: 'This module has no list to show here yet.' },
        callFor: () => '',
    };
    return <ModuleBody {...props} />;
}
