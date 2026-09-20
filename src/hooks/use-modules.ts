'use client';

import { useMemo } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api, isForbidden, isNotFound, type Paginated } from '@/lib/api';
import type { ModuleSummary } from '@/types/modules';

export const MODULES_KEY = ['modules'] as const;

/**
 * What the API said about the modules it runs.
 *
 * `unreadable` is a deployment that would not say: `GET /api/modules` needs SuperAdmin or Admin, so
 * an Accountant is told nothing, and an API older than the endpoint answers 404. Both are answers
 * about the caller rather than about the deployment, so every consumer falls back to what it did
 * before instead of hiding anything.
 */
export type ModuleReport =
    | { kind: 'unreadable' }
    | { kind: 'modules'; modules: readonly ModuleSummary[] };

/**
 * A deployment restart is what changes this, so it is read once and kept. Refreshed on focus
 * because the API and the console are separate images: a tab can outlive the module set it read.
 */
const STALE_MS = 5 * 60 * 1000;

/** The whole list in one page. The endpoint caps a page at 100 and nothing runs that many. */
const PAGE_SIZE = 100;

function isSummary(value: unknown): value is ModuleSummary {
    const m = value as ModuleSummary | null;
    return !!m && typeof m.name === 'string' && typeof m.enabled === 'boolean';
}

/**
 * The module list out of the response, or null when the response is not one.
 *
 * Null rather than an empty list, deliberately. An empty list is a real answer, a deployment that
 * installs no modules, and it hides every module item in the rail. A response nobody recognises
 * must not be read as that: it is a deployment that did not tell us, and the caller keeps what it
 * had. An empty `items` is still taken at face value, because that is what the endpoint sends.
 */
function readInventory(data: unknown): readonly ModuleSummary[] | null {
    const items = Array.isArray(data)
        ? data
        : Array.isArray((data as Paginated<ModuleSummary> | null)?.items)
          ? (data as Paginated<ModuleSummary>).items
          : null;
    if (items === null) return null;
    return items.every(isSummary) ? items : null;
}

async function fetchModules(): Promise<ModuleReport> {
    try {
        const { data } = await api.get<Paginated<ModuleSummary> | ModuleSummary[]>('/api/modules', {
            params: { page: 1, pageSize: PAGE_SIZE },
        });
        const modules = readInventory(data);
        return modules === null ? { kind: 'unreadable' } : { kind: 'modules', modules };
    } catch (error) {
        if (isForbidden(error) || isNotFound(error)) return { kind: 'unreadable' };
        throw error;
    }
}

export function modulesQuery() {
    return {
        queryKey: MODULES_KEY,
        queryFn: fetchModules,
        staleTime: STALE_MS,
        retry: false,
    };
}

/** The module list as a query. The rail is the caller that wants the loading state. */
export function useModules() {
    return useQuery({ ...modulesQuery(), refetchOnWindowFocus: true });
}

/**
 * Whether the deployment runs `name`, or undefined when the API has not said: still loading, or it
 * refused, or the request failed. Undefined is not "no". A caller that cannot get an answer keeps
 * whatever it did before this hook existed.
 */
export function isModuleEnabled(report: ModuleReport | undefined, name: string): boolean | undefined {
    if (report?.kind !== 'modules') return undefined;
    return report.modules.some((m) => m.name === name && m.enabled);
}

/** The names the deployment runs, or undefined when the API has not said. */
export function useEnabledModules(): readonly string[] | undefined {
    const { data } = useModules();
    return useMemo(
        () => (data?.kind === 'modules' ? data.modules.filter((m) => m.enabled).map((m) => m.name) : undefined),
        [data],
    );
}

export function useModuleEnabled(name: string): boolean | undefined {
    return isModuleEnabled(useModules().data, name);
}

/**
 * The module report from the cache, fetching it only if nothing has. For a query function that
 * needs the answer before it decides whether to make its own request, rather than a component.
 *
 * Never throws. A failure here is not the caller's failure, and the caller has its own fallback.
 */
export async function readModules(client: QueryClient): Promise<ModuleReport> {
    try {
        return await client.ensureQueryData(modulesQuery());
    } catch {
        return { kind: 'unreadable' };
    }
}
