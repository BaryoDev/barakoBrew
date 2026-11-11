import type { ModuleSummary } from '@/types/modules';

/**
 * The first-party modules barakoBrew has a screen for, with what the All modules page needs to draw
 * one that the deployment does not carry: its package, what it is and where the design files it.
 *
 * Detected by presence (design note D20): `GET /api/modules` still decides what is installed. This
 * list only supplies the cards for the ones it did not list, and fills a category, description or
 * package an older API leaves out.
 *
 * Names are the `Name` each module returns from IBarakoModule and packages are the csproj
 * `PackageId`, both read from the barakoCMS source, except Email.Resend, whose source is not in the
 * working tree: its name is read from the published 4.7.0 package and the 5.1.0 source commit.
 * Categories are each module's `Category` in the core source; Email.Resend sets none there, so it is
 * filed with Email.Smtp under Comms. Only modules published publicly under the barakocms-module tag are listed. A module the API lists that is not here is drawn from what the
 * API sent, so a new module needs no entry for its card to appear.
 */
export interface CatalogEntry {
    name: string;
    /** The name the design shows. The registered `name` stays the key everywhere else. */
    displayName: string;
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

/**
 * The core's `ModuleCategory` constants, in the design's order. Categories the API sends beyond these
 * come after, and a category is compared case-insensitively and shown in this casing.
 */
export const CATEGORY_ORDER = ['Content', 'Comms', 'Access', 'Platform', 'Insight', 'Business'] as const;

const MODULE_GLYPHS = [
    'content', 'form', 'archive', 'database', 'table', 'cube', 'send', 'envelope',
    'key', 'shield', 'flag', 'bug', 'mobile', 'analytics', 'ai', 'coins',
] as const satisfies readonly ModuleGlyph[];

export const FIRST_PARTY: readonly CatalogEntry[] = [
    { name: 'Pages', displayName: 'Pages', package: 'BarakoCMS.Pages', category: 'Content', glyph: 'content', description: 'A page tree with nested navigation, paths and breadcrumbs, for barakoPress to render.' },
    { name: 'Forms', displayName: 'Forms', package: 'BarakoCMS.Forms', category: 'Content', glyph: 'form', description: 'Public form submissions, validated and stored as Sensitive entries, with a honeypot and a rate limit.' },
    { name: 'Files', displayName: 'Files', package: 'BarakoCMS.Files', category: 'Content', glyph: 'archive', description: 'Uploads and serves files, stored in Postgres. Files · S3 moves them to a bucket.' },
    { name: 'Files.S3', displayName: 'Files · S3', package: 'BarakoCMS.Files.S3', category: 'Platform', glyph: 'database', description: 'Keeps Files in AWS S3, Cloudflare R2 or any S3-compatible store.' },
    { name: 'Import', displayName: 'Import', package: 'BarakoCMS.Import', category: 'Content', glyph: 'table', description: 'Bulk-creates entries from .xlsx or CSV uploads, mapped to a content type.' },
    { name: 'Portability', displayName: 'Portability', package: 'BarakoCMS.Portability', category: 'Platform', glyph: 'cube', description: 'Exports content types and their entries as a JSON bundle, and imports it into another instance.' },
    { name: 'Email.Resend', displayName: 'Email · Resend', package: 'BarakoCMS.Email.Resend', category: 'Comms', glyph: 'send', description: 'Sends mail through Resend and records bounces and complaints.' },
    { name: 'Email.Smtp', displayName: 'Email · Smtp', package: 'BarakoCMS.Email.Smtp', category: 'Comms', glyph: 'envelope', description: 'Sends mail through any SMTP relay.' },
    { name: 'ExternalAuth', displayName: 'External sign-in', package: 'BarakoCMS.ExternalAuth', category: 'Access', glyph: 'key', description: 'Continue with Google, GitHub, LinkedIn or Facebook, matched by verified email.' },
    { name: 'DeviceTrust', displayName: 'Device trust', package: 'BarakoCMS.DeviceTrust', category: 'Access', glyph: 'shield', description: 'Binds sessions to devices and can require OTP approval for a new one.' },
    { name: 'FeatureFlags', displayName: 'Feature flags', package: 'BarakoCMS.FeatureFlags', category: 'Platform', glyph: 'flag', description: 'Turns a feature on by tenant, by user or by percentage rollout.' },
    { name: 'Diagnostics', displayName: 'Diagnostics', package: 'BarakoCMS.Diagnostics', category: 'Platform', glyph: 'bug', description: 'Collects browser errors from your apps, grouped by fingerprint with a count.' },
    { name: 'Pwa', displayName: 'PWA', package: 'BarakoCMS.Pwa', category: 'Platform', glyph: 'mobile', description: 'Records installs to the home screen, anonymous or per signed-in user.' },
    { name: 'Analytics.Umami', displayName: 'Analytics · Umami', package: 'BarakoCMS.Analytics.Umami', category: 'Insight', glyph: 'analytics', description: 'Shows Umami traffic in barakoBrew through a server-side proxy.' },
    { name: 'AI', displayName: 'AI', package: 'BarakoCMS.AI', category: 'Insight', glyph: 'ai', description: 'Semantic search over published, Public entries with a self-hosted model. No third-party key.' },
    { name: 'Accounting', displayName: 'Accounting', package: 'BarakoCMS.Accounting', category: 'Business', glyph: 'coins', description: 'Double-entry accounts, balanced journal entries and reports.' },
];

/** True when `value` names a glyph the console has an icon for. */
export function isModuleGlyph(value: unknown): value is ModuleGlyph {
    return typeof value === 'string' && (MODULE_GLYPHS as readonly string[]).includes(value);
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

/** The catalog entry for a module, by the name it registers or by its package id. */
export function catalogEntry(m: Pick<ModuleSummary, 'name' | 'packageId'>): CatalogEntry | undefined {
    const name = norm(m.name);
    const pkg = norm(m.packageId);
    return FIRST_PARTY.find((e) => norm(e.name) === name || (pkg !== '' && norm(e.package) === pkg));
}

/**
 * The module list the All modules page draws: what the API listed, with gaps filled from the
 * catalog, then every catalog module the API did not list as a card that is not installed.
 */
/** The category in CATEGORY_ORDER casing when it matches one ignoring case, else the text as sent. */
export function normaliseCategory(value: string | undefined): string | undefined {
    const v = value?.trim();
    if (!v) return undefined;
    return CATEGORY_ORDER.find((c) => c.toLowerCase() === v.toLowerCase()) ?? v;
}

export function withFirstParty(listed: readonly ModuleSummary[]): ModuleSummary[] {
    const merged = listed.map((m) => {
        const entry = catalogEntry(m);
        if (!entry) return m;
        return {
            ...m,
            packageId: m.packageId || entry.package,
            category: normaliseCategory(m.category) ?? entry.category,
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
        packageId: e.package,
        category: e.category,
        description: e.description,
    }));
    return [...merged, ...missing];
}

/** What a card or header calls a module: the design's display name for a first-party one, else the registered name. */
export function moduleDisplayName(m: Pick<ModuleSummary, 'name' | 'packageId'>): string {
    return catalogEntry(m)?.displayName ?? m.name;
}

/** The glyph a module is drawn with: the API's when it names a known one, else the catalog's, else the cube. */
export function moduleGlyph(m: Pick<ModuleSummary, 'name' | 'packageId' | 'glyph'>): ModuleGlyph {
    if (isModuleGlyph(m.glyph)) return m.glyph;
    return catalogEntry(m)?.glyph ?? 'cube';
}
