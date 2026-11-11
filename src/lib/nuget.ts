/**
 * Reading the NuGet search for packages carrying the `barakocms-module` tag (#248).
 *
 * Anyone can publish under that tag, so every field is untrusted. Nothing here returns markup, only
 * plain strings and numbers that a component renders as text. `iconUrl` is never read: the browser
 * would fetch an address a stranger chose, so the card draws the generic tile instead.
 */

export const MODULE_TAG = 'barakocms-module';

/** The search service the NuGet service index lists for `SearchQueryService`. */
export const NUGET_SEARCH_URL = 'https://azuresearch-usnc.nuget.org/query';

/** Page size of one search request, and the most pages read, so at most 200 packages are shown. */
export const NUGET_PAGE_SIZE = 50;
export const NUGET_MAX_PAGES = 4;
export const NUGET_MAX_PACKAGES = NUGET_PAGE_SIZE * NUGET_MAX_PAGES;
const NUGET_TIMEOUT_MS = 8000;

export interface NugetPackage {
    id: string;
    version: string;
    title: string;
    description: string;
    publisher: string;
    downloads: number | null;
    tags: string[];
    /** Built here from the id, never taken from the response. */
    nugetUrl: string;
    /** The package's own project link, only when it is an `https:` URL. */
    projectUrl: string | null;
}

export interface NugetResult {
    packages: NugetPackage[];
    /** What the search said it holds. More than `packages.length` means the list was cut. */
    totalHits: number;
    truncated: boolean;
}

const PACKAGE_ID = /^[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g;

function text(value: unknown, max: number): string {
    return typeof value === 'string' ? value.replace(CONTROL, ' ').trim().slice(0, max) : '';
}

/** `https:` only. `javascript:`, `data:`, `http:` and anything that does not parse are dropped. */
export function httpsUrl(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
        const url = new URL(value.trim());
        return url.protocol === 'https:' && url.hostname ? url.toString() : null;
    } catch {
        return null;
    }
}

function firstName(value: unknown): string {
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
        const name = text(item, 100);
        if (name) return name;
    }
    return '';
}

function readPackage(raw: unknown): NugetPackage | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (id.length > 100 || !PACKAGE_ID.test(id)) return null;

    const version = text(r.version, 64);
    const downloads = typeof r.totalDownloads === 'number' && Number.isFinite(r.totalDownloads) && r.totalDownloads >= 0
        ? Math.floor(r.totalDownloads)
        : null;
    const tags = (Array.isArray(r.tags) ? r.tags : [])
        .map((t) => text(t, 50))
        .filter(Boolean)
        .slice(0, 30);

    return {
        id,
        version: VERSION.test(version) ? version : '',
        title: text(r.title, 100) || id,
        description: text(r.description, 500),
        publisher: firstName(r.owners) || firstName(r.authors),
        downloads,
        tags,
        nugetUrl: `https://www.nuget.org/packages/${encodeURIComponent(id)}`,
        projectUrl: httpsUrl(r.projectUrl),
    };
}

/**
 * One search response as a list of packages. Throws when the response is not a search response at
 * all, so a captive portal's HTML or an error body reads as unavailable rather than as "no modules".
 * A row that is not a package is skipped, and a package id seen twice (any case) is kept once.
 */
export function parseSearchPage(data: unknown): { packages: NugetPackage[]; totalHits: number } {
    const body = data as { data?: unknown; totalHits?: unknown } | null;
    if (typeof body !== 'object' || body === null || !Array.isArray(body.data)) {
        throw new Error('NuGet search sent a response that is not a package list.');
    }
    const seen = new Set<string>();
    const packages: NugetPackage[] = [];
    for (const row of body.data.slice(0, NUGET_PAGE_SIZE)) {
        const pkg = readPackage(row);
        if (!pkg || seen.has(pkg.id.toLowerCase())) continue;
        seen.add(pkg.id.toLowerCase());
        packages.push(pkg);
    }
    const totalHits = typeof body.totalHits === 'number' && Number.isFinite(body.totalHits) && body.totalHits >= 0
        ? Math.floor(body.totalHits)
        : packages.length;
    return { packages, totalHits };
}

export function searchUrl(skip: number): string {
    const params = new URLSearchParams({
        q: `tags:${MODULE_TAG}`,
        take: String(NUGET_PAGE_SIZE),
        skip: String(skip),
        prerelease: 'false',
        semVerLevel: '2.0.0',
    });
    return `${NUGET_SEARCH_URL}?${params.toString()}`;
}

/**
 * Every package under the tag, up to the cap. A plain `fetch`, not the API client: that one adds the
 * console's bearer token to whatever it calls, and nuget.org has no business seeing it.
 */
export async function fetchModulePackages(fetchImpl: typeof fetch = fetch): Promise<NugetResult> {
    const packages: NugetPackage[] = [];
    const seen = new Set<string>();
    let totalHits = 0;

    for (let page = 0; page < NUGET_MAX_PAGES; page++) {
        const response = await fetchImpl(searchUrl(page * NUGET_PAGE_SIZE), {
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(NUGET_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`NuGet search answered ${response.status}.`);
        const parsed = parseSearchPage(await response.json());
        totalHits = parsed.totalHits;
        const before = packages.length;
        for (const pkg of parsed.packages) {
            if (seen.has(pkg.id.toLowerCase())) continue;
            seen.add(pkg.id.toLowerCase());
            packages.push(pkg);
        }
        if (parsed.packages.length === 0 || packages.length === before) break;
        if ((page + 1) * NUGET_PAGE_SIZE >= totalHits) break;
    }

    return { packages, totalHits, truncated: totalHits > packages.length };
}

export const NUGET_TAG_SEARCH_URL = `https://www.nuget.org/packages?q=${encodeURIComponent(`Tags:"${MODULE_TAG}"`)}`;
