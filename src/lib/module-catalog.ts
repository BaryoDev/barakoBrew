import type { ModuleSummary } from '@/types/modules';

/**
 * The first-party modules barakoBrew has a screen for, with what the All modules page needs to draw
 * one that the deployment does not carry: its package, what it is and where the design files it.
 *
 * Detected by presence (design note D20): `GET /api/modules` still decides what is installed. This
 * list only supplies the cards for the ones it did not list, and fills a category, description or
 * package an older API leaves out. A module the API lists that is not here is drawn from what the
 * API sent, so a new module needs no entry for its card to appear.
 */
export interface CatalogEntry {
    name: string;
    package: string;
    category: string;
    description: string;
    glyph: ModuleGlyph;
}

export type ModuleGlyph =
    | 'content'
    | 'form'
    | 'archive'
    | 'database'
    | 'table'
    | 'cube'
    | 'send'
    | 'envelope'
    | 'key'
    | 'shield'
    | 'flag'
    | 'bug'
    | 'mobile'
    | 'analytics'
    | 'ai'
    | 'coins';

/** The category order the design's filter uses. Categories the API sends beyond these come after. */
export const CATEGORY_ORDER = ['Content', 'Storage', 'Email', 'Auth', 'Ops', 'Analytics', 'Domain'] as const;

export const FIRST_PARTY: readonly CatalogEntry[] = [
    { name: 'Pages', package: 'BarakoCMS.Pages', category: 'Content', glyph: 'content', description: 'A page tree with nested navigation, paths and breadcrumbs, for barakoPress to render.' },
    { name: 'Forms', package: 'BarakoCMS.Forms', category: 'Content', glyph: 'form', description: 'Public form submissions, validated and stored as Sensitive entries, with a honeypot and a rate limit.' },
    { name: 'Files', package: 'BarakoCMS.Files', category: 'Storage', glyph: 'archive', description: 'Uploads and serves files, stored in Postgres. Files · S3 moves them to a bucket.' },
    { name: 'Files.S3', package: 'BarakoCMS.Files.S3', category: 'Storage', glyph: 'database', description: 'Keeps Files in AWS S3, Cloudflare R2 or any S3-compatible store.' },
    { name: 'Import', package: 'BarakoCMS.Import', category: 'Content', glyph: 'table', description: 'Bulk-creates entries from .xlsx or CSV uploads, mapped to a content type.' },
    { name: 'Portability', package: 'BarakoCMS.Portability', category: 'Ops', glyph: 'cube', description: 'Exports content types and their entries as a JSON bundle, and imports it into another instance.' },
    { name: 'Email.Resend', package: 'BarakoCMS.Email.Resend', category: 'Email', glyph: 'send', description: 'Sends mail through Resend and records bounces and complaints.' },
    { name: 'Email.Smtp', package: 'BarakoCMS.Email.Smtp', category: 'Email', glyph: 'envelope', description: 'Sends mail through any SMTP relay.' },
    { name: 'ExternalAuth', package: 'BarakoCMS.ExternalAuth', category: 'Auth', glyph: 'key', description: 'Continue with Google, GitHub, LinkedIn or Facebook, matched by verified email.' },
    { name: 'DeviceTrust', package: 'BarakoCMS.DeviceTrust', category: 'Auth', glyph: 'shield', description: 'Binds sessions to devices and can require OTP approval for a new one.' },
    { name: 'FeatureFlags', package: 'BarakoCMS.FeatureFlags', category: 'Ops', glyph: 'flag', description: 'Turns a feature on by tenant, by user or by percentage rollout.' },
    { name: 'Diagnostics', package: 'BarakoCMS.Diagnostics', category: 'Ops', glyph: 'bug', description: 'Collects browser errors from your apps, grouped by fingerprint with a count.' },
    { name: 'Pwa', package: 'BarakoCMS.Pwa', category: 'Analytics', glyph: 'mobile', description: 'Records installs to the home screen, anonymous or per signed-in user.' },
    { name: 'Analytics.Umami', package: 'BarakoCMS.Analytics.Umami', category: 'Analytics', glyph: 'analytics', description: 'Shows Umami traffic in barakoBrew through a server-side proxy.' },
    { name: 'AI', package: 'BarakoCMS.AI', category: 'Content', glyph: 'ai', description: 'Semantic search over published, Public entries with a self-hosted model. No third-party key.' },
    { name: 'Accounting', package: 'BarakoCMS.Accounting', category: 'Domain', glyph: 'coins', description: 'Double-entry accounts, balanced journal entries and reports.' },
];

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

/** The catalog entry for a module, by the name it registers or by its package id. */
export function catalogEntry(m: Pick<ModuleSummary, 'name' | 'package'>): CatalogEntry | undefined {
    const name = norm(m.name);
    const pkg = norm(m.package);
    return FIRST_PARTY.find((e) => norm(e.name) === name || (pkg !== '' && norm(e.package) === pkg));
}

/**
 * The module list the All modules page draws: what the API listed, with gaps filled from the
 * catalog, then every catalog module the API did not list as a card that is not installed.
 */
export function withFirstParty(listed: readonly ModuleSummary[]): ModuleSummary[] {
    const merged = listed.map((m) => {
        const entry = catalogEntry(m);
        if (!entry) return m;
        return {
            ...m,
            package: m.package || entry.package,
            category: m.category?.trim() || entry.category,
            description: m.description || entry.description,
        };
    });
    const have = new Set(merged.map((m) => norm(catalogEntry(m)?.name ?? m.name)));
    const missing: ModuleSummary[] = FIRST_PARTY.filter((e) => !have.has(norm(e.name))).map((e) => ({
        name: e.name,
        contractVersion: 0,
        enabled: false,
        installed: false,
        schemaState: 'unknown',
        schemaChanges: [],
        package: e.package,
        category: e.category,
        description: e.description,
    }));
    return [...merged, ...missing];
}
