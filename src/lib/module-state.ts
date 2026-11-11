import type { ModuleSummary } from '@/types/modules';
import { CATEGORY_ORDER, FIRST_PARTY, catalogEntry, normaliseCategory } from '@/lib/module-catalog';

/**
 * The three states a module card shows. Not two: a module the deployment carries but this tenant
 * has not turned on is a different thing to do about (Enable) than one that is not there at all
 * (install it).
 */
export type ModuleState = 'enabled' | 'installed' | 'not-installed';

export function moduleState(m: ModuleSummary): ModuleState {
    if (m.installed === false) return 'not-installed';
    return m.enabled ? 'enabled' : 'installed';
}

export const MODULE_STATE_LABEL: Record<ModuleState, string> = {
    enabled: 'Enabled',
    installed: 'Installed, not enabled',
    'not-installed': 'Not installed',
};

export const UNCATEGORISED = 'Other';

export interface ModuleGroup {
    category: string;
    modules: ModuleSummary[];
}

/**
 * Groups by the category the API sent, categories and modules in name order, with modules that
 * sent none last under "Other". The grouping reads whatever the API listed; no module name is
 * typed here.
 */
export function groupByCategory(modules: readonly ModuleSummary[]): ModuleGroup[] {
    const byCategory = new Map<string, ModuleSummary[]>();
    for (const m of modules) {
        const key = m.category?.trim() || UNCATEGORISED;
        byCategory.set(key, [...(byCategory.get(key) ?? []), m]);
    }
    return [...byCategory.entries()]
        .sort(([a], [b]) =>
            a === UNCATEGORISED ? 1 : b === UNCATEGORISED ? -1 : a.localeCompare(b),
        )
        .map(([category, list]) => ({
            category,
            modules: [...list].sort((x, y) => x.name.localeCompare(y.name)),
        }));
}

const NUGET_ID = /^[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*$/;

/** The package id comes from the API and ends up pasted into a shell, so only a plain NuGet id is accepted. */
export function installLine(m: Pick<ModuleSummary, 'packageId'>): string | null {
    const id = m.packageId?.trim();
    return id && NUGET_ID.test(id) ? `dotnet add package ${id}` : null;
}

export function moduleHref(name: string): string {
    return `/modules/${encodeURIComponent(name)}`;
}

/** The category the card and the filter use: the API's, then the catalog's, else "Other". */
export function moduleCategory(m: ModuleSummary): string {
    return normaliseCategory(m.category) ?? catalogEntry(m)?.category ?? UNCATEGORISED;
}

function categoryRank(category: string): number {
    const i = (CATEGORY_ORDER as readonly string[]).indexOf(category);
    return i === -1 ? (category === UNCATEGORISED ? CATEGORY_ORDER.length + 1 : CATEGORY_ORDER.length) : i;
}

export interface CategoryCount {
    category: string;
    count: number;
}

/** Categories in the design's order, then any the API added by name, "Other" last, each with its count. */
export function categoryCounts(modules: readonly ModuleSummary[]): CategoryCount[] {
    const counts = new Map<string, number>();
    for (const m of modules) counts.set(moduleCategory(m), (counts.get(moduleCategory(m)) ?? 0) + 1);
    return [...counts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.category.localeCompare(b.category));
}

/** First-party modules in the design's order, then the rest by name. */
export function sortModules(modules: readonly ModuleSummary[]): ModuleSummary[] {
    const index = (m: ModuleSummary) => {
        const entry = catalogEntry(m);
        return entry ? FIRST_PARTY.indexOf(entry) : FIRST_PARTY.length;
    };
    return [...modules].sort((a, b) => index(a) - index(b) || a.name.localeCompare(b.name));
}
