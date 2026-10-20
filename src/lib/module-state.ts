import type { ModuleSummary } from '@/types/modules';

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

export function installLine(m: Pick<ModuleSummary, 'package'>): string | null {
    return m.package ? `dotnet add package ${m.package}` : null;
}

export function moduleHref(name: string): string {
    return `/modules/${encodeURIComponent(name)}`;
}
