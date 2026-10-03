/**
 * Share links, whatever a link is scoped to.
 *
 * A scope says what a link covers and where the API serves it: the whole site, or one entry (a
 * page link is an entry link that also carries the path the page is served at). Each is a builder
 * in `@/lib/site-mode`, and the panel, the hooks and the query cache work from a scope alone.
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
    /** `site`, `entry` or `page`. Absent before barakoCMS 4.6, where every link was a site link. */
    scope?: string;
    /** Set on a page link: the path it was made for. */
    path?: string | null;
}

/** The create response, the only one that carries `key`. */
export interface CreatedShareLink {
    id: string;
    label: string;
    expiresAt: string | null;
    createdAt: string;
    key: string;
    scope?: string;
    path?: string | null;
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
    /** The panel offers a page path, which makes the link a page link. Entry scopes only. */
    acceptsPath?: boolean;
    /**
     * A 403 on the list hides the panel instead of showing an error. An entry's links need update on
     * that entry, and someone who can only read it has nothing to do here.
     */
    hideWhenForbidden?: boolean;
}

/** The longest page path the API accepts. */
const MAX_PATH_LENGTH = 2048;

/**
 * Backslash, `?`, `#`, `%`, whitespace, control characters and the Basic Multilingual Plane's format
 * characters (soft hyphen, zero width spaces, the bidi marks and overrides, the byte order mark).
 * Spelled out rather than `\p{Cf}`, which needs an ES2018 target. A format character outside the
 * BMP still reaches the API, which refuses it.
 */
const REFUSED_IN_PATH =
    // eslint-disable-next-line no-control-regex -- control characters are exactly what this refuses.
    /[\\?#%\s\u0000-\u001F\u007F-\u009F\u00AD\u0600-\u0605\u061C\u06DD\u070F\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]/;

/**
 * The API's rule for a page link's path: a leading slash, no empty, `.` or `..` segment, and no
 * whitespace, backslash, `?`, `#`, `%`, control or format character. The API is still the one that
 * refuses; this lets the form say so before a round trip.
 */
export function isSitePath(path: string): boolean {
    if (path.length === 0 || path.length > MAX_PATH_LENGTH || path[0] !== '/') return false;
    if (path.includes('//')) return false;
    if (path.split('/').some((segment) => segment === '.' || segment === '..')) return false;
    return !REFUSED_IN_PATH.test(path);
}

/**
 * The link a preview token is handed over as: the site address, the path the entry is read at, and
 * the token in the query parameter the API names. Null when the site has no usable address.
 */
export function previewLinkUrl(siteUrl: string | null, path: string, token: string, queryParam = 'preview'): string | null {
    if (!siteUrl) return null;
    const base = siteUrl.trim().replace(/\/+$/, '');
    const at = path.startsWith('/') ? path : `/${path}`;
    return `${base}${at}?${encodeURIComponent(queryParam)}=${encodeURIComponent(token)}`;
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

/** Enough of a field definition to find the slug the way the API does. */
interface SlugCandidate {
    name: string;
    type: string;
    sensitivity?: string;
}

/**
 * The entry's slug, found the way `POST /api/preview` finds it: a field of type `slug`, or else a
 * Public string or text field named Slug. Null when the type has neither, which is when the API
 * answers 404 for a preview.
 */
export function entrySlug(fields: SlugCandidate[], data: Record<string, unknown>): string | null {
    const lower = (value: string) => value.toLowerCase();
    const field =
        fields.find((f) => lower(f.type) === 'slug') ??
        fields.find(
            (f) =>
                lower(f.name) === 'slug' &&
                (f.sensitivity ?? 'Public') === 'Public' &&
                (lower(f.type) === 'string' || lower(f.type) === 'text'),
        );
    if (!field) return null;
    const value = data[field.name];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
