/**
 * Site mode, the holding page and share links, as barakoCMS documents them for the `site` type.
 *
 * Mode is presentation for the site's renderer. The API hides nothing because of it, so the screen
 * says that next to the control.
 */
import { isAbsoluteHttpUrl } from '@/lib/site-settings';
import type { PageTreeState } from '@/hooks/use-pages';
import type { FieldDefinition, FieldOption } from '@/types/schema';

export const SITE_MODE_FIELD = 'Mode';
export const HOLDING_PATH_FIELD = 'HoldingPath';

export const LIVE = 'Live';
export const HOLDING = 'Holding';

const DEFAULT_MODES: FieldOption[] = [
    { value: LIVE, label: LIVE },
    { value: HOLDING, label: HOLDING },
];

/** Unset means Live. Any other stored string is kept as it is, so opening the screen changes nothing. */
export function readMode(value: unknown): string {
    return typeof value === 'string' && value.trim() !== '' ? value : LIVE;
}

/**
 * The options the Mode select offers: the field's own when it is a choice field with options, Live
 * and Holding otherwise, and the stored value when neither list has it.
 */
export function modeOptions(field: FieldDefinition | undefined, stored: unknown): FieldOption[] {
    const options = field?.options?.length ? field.options : DEFAULT_MODES;
    const current = readMode(stored);
    return options.some((o) => o.value === current) ? options : [...options, { value: current, label: current }];
}

export interface HoldingPageOption {
    path: string;
    label: string;
}

const published = (status: string | null) => status?.toLowerCase() === 'published';

/**
 * Every published page with a path, in tree order, labelled with its depth. Empty while the tree is
 * unknown. A draft is left out because barakoPress resolves only published pages, so a holding path
 * pointing at one would not render.
 */
export function holdingPageOptions(state: PageTreeState | undefined): HoldingPageOption[] {
    if (!state || state.kind === 'disabled') return [];
    if (state.kind === 'flat') {
        return state.rows
            .filter(
                (row): row is typeof row & { path: string } =>
                    typeof row.path === 'string' && row.path !== '' && published(row.status),
            )
            .map((row) => ({ path: row.path, label: `${row.title ?? row.slug ?? row.path} (${row.path})` }));
    }

    const out: HoldingPageOption[] = [];
    const visit = (id: string) => {
        const node = state.forest.byId.get(id);
        if (!node) return;
        if (node.path && published(node.status)) {
            // Non-breaking, because a select collapses ordinary leading spaces and the nesting would vanish.
            const indent = '\u00A0\u00A0'.repeat(node.depth);
            out.push({ path: node.path, label: `${indent}${node.title ?? node.slug ?? node.path} (${node.path})` });
        }
        node.childIds.forEach(visit);
    };
    state.forest.rootIds.forEach(visit);
    return out;
}

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

export const SHARE_LINK_EXPIRY_DAYS = [1, 7, 30, 90] as const;
export const DEFAULT_SHARE_LINK_DAYS = 30;
export const MAX_SHARE_LINK_DAYS = 90;

export function shareLinkExpiry(days: number, now: Date = new Date()): string {
    const clamped = Math.min(Math.max(days, 1), MAX_SHARE_LINK_DAYS);
    return new Date(now.getTime() + clamped * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The link a client is given: `{site Url}/_share#{key}`. The key sits in the fragment so it never
 * reaches a server log or a referrer. Null when the site has no usable address.
 */
export function shareLinkUrl(siteUrl: unknown, key: string): string | null {
    if (typeof siteUrl !== 'string' || !isAbsoluteHttpUrl(siteUrl)) return null;
    return `${siteUrl.trim().replace(/\/+$/, '')}/_share#${key}`;
}
