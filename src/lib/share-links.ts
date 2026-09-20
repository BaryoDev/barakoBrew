/**
 * Share links, whatever a link is scoped to.
 *
 * A scope says what a link covers and where the API serves it. barakoCMS serves one scope today,
 * the whole site. BaryoDev/barakoCMS#857 adds entry and page scopes; each is a builder like
 * `siteShareScope` in `@/lib/site-mode`, and the panel, the hooks and the query cache work from a
 * scope alone, so none of them changes when one arrives.
 *
 * Nothing here imports through `@/`, so `smoke/` can read the same values the console ships instead
 * of restating them.
 */

export interface ShareLink {
    id: string;
    label: string;
    createdAt: string;
    createdBy?: string | null;
    expiresAt: string | null;
    revokedAt?: string | null;
    lastUsedAt?: string | null;
}

/** The create response, the only one that carries `key`. */
export interface CreatedShareLink {
    id: string;
    label: string;
    expiresAt: string | null;
    createdAt: string;
    key: string;
}

export type ShareLinkStatus = 'active' | 'expired' | 'revoked';

/** Revoked wins over expired, since revoking is the thing someone did on purpose. */
export function shareLinkStatus(
    link: Pick<ShareLink, 'expiresAt' | 'revokedAt'>,
    now: Date = new Date(),
): ShareLinkStatus {
    if (link.revokedAt) return 'revoked';
    if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) return 'expired';
    return 'active';
}

/** What goes in the one-time box after a link is created. */
export interface ShareLinkTarget {
    value: string;
    /** False when this is only the part that goes after an address nobody saved. */
    complete: boolean;
}

export interface ShareLinkScope {
    /** Tells one scope's links from another's in the query cache. */
    key: readonly string[];
    /** `GET` lists and `POST` creates here, `${path}/${id}` revokes. */
    path: string;
    /** Sits under the panel heading and says what the links let someone see. */
    description: string;
    /** What revoking takes away, in the confirm dialog. */
    revokeWarning: string;
    /** The link to hand over, built from the key the API returns once. */
    link: (key: string) => ShareLinkTarget;
    /** Shown when the link came back incomplete. */
    incompleteNote: string;
}

/**
 * The maximum the console uses when the API reports none, which is every barakoCMS through 4.3.0:
 * the create validator refuses an expiry more than 90 days out, and no response carries that number
 * (it lives in a FluentValidation lambda, so it is not in the OpenAPI document either). Prefer
 * whatever the API reports, through `maxShareLinkDays`.
 */
export const FALLBACK_MAX_SHARE_LINK_DAYS = 90;

/** Where the expiry select starts, when the maximum leaves room for it. */
const PREFERRED_DAYS = 30;

/** Offered while the maximum allows them. The maximum itself is always offered as well. */
const CHOICES = [1, 7, 30, 90, 180, 365];

const DAY = 24 * 60 * 60 * 1000;

/** The reported maximum when there is a usable one, the fallback otherwise. */
export function maxShareLinkDays(reported: number | null | undefined): number {
    if (typeof reported !== 'number' || !Number.isFinite(reported) || reported < 1) {
        return FALLBACK_MAX_SHARE_LINK_DAYS;
    }
    return Math.floor(reported);
}

/**
 * What a list response says the maximum expiry is, in days, or null when it says nothing.
 *
 * No barakoCMS through 4.3.0 sends this. It is read here so that the release which starts sending
 * it moves the console without a console release, and so the number has one name to add server
 * side rather than whichever one the next reader invents.
 */
export function reportedMaxShareLinkDays(body: unknown): number | null {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const raw = (body as { maxExpiryDays?: unknown }).maxExpiryDays;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) return null;
    return Math.floor(raw);
}

/** The choices under the maximum, then the maximum, so it can always be picked whatever it is. */
export function shareLinkExpiryChoices(maxDays: number): number[] {
    const max = maxShareLinkDays(maxDays);
    return [...CHOICES.filter((d) => d < max), max];
}

/** Always one of `shareLinkExpiryChoices`, since 30 is one of them and the maximum is always last. */
export function defaultShareLinkDays(maxDays: number): number {
    return Math.min(PREFERRED_DAYS, maxShareLinkDays(maxDays));
}

/** An expiry the maximum allows, since the API takes a timestamp and refuses one too far out. */
export function shareLinkExpiry(days: number, maxDays: number, now: Date = new Date()): string {
    const wanted = Number.isFinite(days) ? Math.floor(days) : PREFERRED_DAYS;
    const clamped = Math.min(Math.max(wanted, 1), maxShareLinkDays(maxDays));
    return new Date(now.getTime() + clamped * DAY).toISOString();
}
