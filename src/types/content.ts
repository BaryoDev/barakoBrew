// Types for Content items (event-sourced on the backend).

export interface ContentListItem {
    id: string;
    contentType: string;
    data: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    // The list omitted these until 4.0, so an entries table could not show whether a row was a
    // Draft without a second request per row.
    status: ContentStatus;
    sensitivity: SensitivityLevel;
    // The table shows this, and the list did not carry it until 4.0. Absent against an older API,
    // which is why it is optional and why the cell renders nothing rather than a zero: a row showing
    // v0 is a claim about the entry, and "the server did not say" is not the same claim.
    version?: number;
}

export interface ContentDetail extends ContentListItem {
    lastModifiedBy?: string;
    version: number; // echo back on update, the backend enforces optimistic concurrency (412)
    // Null when nothing is armed. Both UTC with a zone, so new Date() reads them correctly wherever
    // the browser is.
    scheduledPublishAt?: string | null;
    scheduledUnpublishAt?: string | null;
}

/**
 * An entry as read, plus the ETag that read returned.
 *
 * Not part of the response body: the API sends it as an HTTP header, and it is carried here so the
 * save that follows can send it back as `If-Match`. Optional because it is genuinely absent
 * sometimes. The server does not emit one for an event-sourced type, deliberately, since that
 * type's write path does not consult `If-Match` and a header there would promise a precondition
 * nothing checks.
 */
export interface ContentDetailRead extends ContentDetail {
    etag?: string;
}

export interface ScheduleContentRequest {
    scheduledPublishAt: string | null;
    scheduledUnpublishAt: string | null;
}

// Names, not numbers, matching the API from 4.0. These used to be 0/1/2, transcribed from the
// server's enum, so inserting a member there silently renumbered everything here. The switch is not
// only a rename: ContentStatus.Draft was 0, which is falsy, and 'Draft' is not, so any truthiness
// check written against the old values means the opposite now.
//
// The labels and tones for these are in src/lib/status-vocabulary.ts, not here. That vocabulary has
// to cover In review, which this enum does not have because the API does not send it yet, and it has
// to be reachable from screens that never touch a ContentStatus. Keeping it beside the enum meant a
// second, shorter vocabulary, and the two drifted.
export enum ContentStatus {
    Draft = 'Draft',
    Published = 'Published',
    Archived = 'Archived',
    // A draft with a publish time on it, waiting for the server to promote it. A real status from
    // 4.0 rather than something this screen worked out from a date, so the filter below can ask the
    // server for it instead of guessing over one page of rows. See DECISIONS.md D12.
    Scheduled = 'Scheduled',
}

export enum SensitivityLevel {
    Public = 'Public',
    Sensitive = 'Sensitive',
    Hidden = 'Hidden',
}

export interface CreateContentRequest {
    contentType: string;
    data: Record<string, unknown>;
    status: ContentStatus;
    sensitivity?: SensitivityLevel;
}

export interface UpdateContentRequest {
    data: Record<string, unknown>;
    status: ContentStatus;
    version: number;
}

/** One event from a content stream. Not every event is a document version. */
export interface ContentVersion {
    id: string;
    /** Which kind of change this was. Decided server side, not the event class name. */
    changeType: 'Created' | 'Updated' | 'StatusChanged' | 'Scheduled' | 'SensitivityChanged' | string;
    /** Only Created and Updated carry a document. Absent on the rest. */
    data?: Record<string, unknown>;
    lastModifiedBy?: string;
    versionId: string;
    // UTC, with a zone. There used to be an updatedAt here carrying the same instant without one,
    // which new Date() read as local time.
    timestamp: string;
    status?: ContentStatus;
    scheduledPublishAt?: string;
    scheduledUnpublishAt?: string;
    sensitivity?: SensitivityLevel;
}

export const SENSITIVITY_META: Record<SensitivityLevel, { label: string; description: string }> = {
    [SensitivityLevel.Public]: { label: 'Public', description: 'Visible to every reader' },
    [SensitivityLevel.Sensitive]: { label: 'Sensitive', description: 'Data hidden except from SuperAdmin and HR' },
    [SensitivityLevel.Hidden]: { label: 'Hidden', description: 'Data hidden except from SuperAdmin' },
};
