'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { useModules } from '@/hooks/use-modules';
import { useNugetModules } from '@/hooks/use-nuget-modules';
import { withFirstParty } from '@/lib/module-catalog';
import { moduleState, type ModuleState } from '@/lib/module-state';
import { NUGET_MAX_PACKAGES, NUGET_TAG_SEARCH_URL, type NugetPackage } from '@/lib/nuget';
import { BrowseCard } from './browse-card';

const ALL = 'All';
const OTHER = 'Other';

// Browse has no category of its own to read: NuGet gives tags. A tag that names one of the
// console's categories files the package there, the same for every publisher.
const CATEGORY_TAGS = ['content', 'storage', 'email', 'auth', 'ops', 'analytics', 'domain'];

function categoryOf(pkg: NugetPackage): string {
    const tag = pkg.tags.map((t) => t.toLowerCase()).find((t) => CATEGORY_TAGS.includes(t));
    return tag ? tag[0].toUpperCase() + tag.slice(1) : OTHER;
}

/** Package id (lowercase) to the state this deployment is in for it. A Map, so an id of `__proto__` is just a key. */
function stateByPackage(listed: readonly import('@/types/modules').ModuleSummary[]): Map<string, ModuleState> {
    const map = new Map<string, ModuleState>();
    for (const m of withFirstParty(listed)) {
        if (m.package) map.set(m.package.toLowerCase(), moduleState(m));
    }
    return map;
}

export function BrowseModules() {
    const nuget = useNugetModules(true);
    const report = useModules().data;
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState(ALL);
    const [publisher, setPublisher] = useState(ALL);

    const states = useMemo(
        () => (report?.kind === 'modules' ? stateByPackage(report.modules) : null),
        [report],
    );
    const packages = useMemo(() => nuget.data?.packages ?? [], [nuget.data]);
    const categories = useMemo(() => [...new Set(packages.map(categoryOf))].sort(), [packages]);
    const publishers = useMemo(
        () => [...new Set(packages.map((p) => p.publisher).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        [packages],
    );

    if (nuget.isLoading) return <Skeleton className="h-32 w-full" />;
    if (nuget.isError || !nuget.data) {
        return (
            <p role="status" className="text-muted-foreground text-sm">
                The NuGet package list is unavailable. This browser could not reach nuget.org, which an
                offline deployment or a blocking network will cause. The installed modules are listed
                under This deployment.
            </p>
        );
    }
    if (packages.length === 0) {
        return <p className="text-muted-foreground text-sm">No packages carry the barakocms-module tag.</p>;
    }

    const q = query.trim().toLowerCase();
    const shown = packages.filter(
        (p) =>
            (category === ALL || categoryOf(p) === category) &&
            (publisher === ALL || p.publisher === publisher) &&
            (q === '' || p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <div className="grid min-w-[220px] flex-1 gap-1 text-xs font-medium">
                    <label htmlFor="browse-search">Search</label>
                    <Input
                        id="browse-search"
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Name or description"
                    />
                </div>
                <div className="grid gap-1 text-xs font-medium">
                    <label htmlFor="browse-publisher">Publisher</label>
                    <select
                        id="browse-publisher"
                        value={publisher}
                        onChange={(e) => setPublisher(e.target.value)}
                        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                    >
                        <option value={ALL}>All publishers</option>
                        {publishers.map((p) => (
                            <option key={p} value={p}>
                                {p}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <SegmentedControl value={category} onValueChange={setCategory} aria-label="Filter by category" className="h-auto flex-wrap">
                <SegmentedControlItem value={ALL} className="h-8">
                    {ALL}
                    <span className="font-mono text-[11px] opacity-70">{packages.length}</span>
                </SegmentedControlItem>
                {categories.map((c) => (
                    <SegmentedControlItem key={c} value={c} className="h-8">
                        {c}
                        <span className="font-mono text-[11px] opacity-70">
                            {packages.filter((p) => categoryOf(p) === c).length}
                        </span>
                    </SegmentedControlItem>
                ))}
            </SegmentedControl>
            {states === null && (
                <p className="text-muted-foreground text-sm">
                    This deployment&apos;s module list is not available to you, so installed state is not shown.
                </p>
            )}
            {nuget.data.truncated && (
                <p role="status" className="text-muted-foreground text-sm">
                    Showing the first {Math.min(packages.length, NUGET_MAX_PACKAGES)} of {nuget.data.totalHits}{' '}
                    packages. The rest are{' '}
                    <a href={NUGET_TAG_SEARCH_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        on nuget.org
                    </a>
                    .
                </p>
            )}
            {shown.length === 0 ? (
                <p className="text-muted-foreground text-sm">No packages match.</p>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3">
                    {shown.map((p) => (
                        <BrowseCard
                            key={p.id.toLowerCase()}
                            pkg={p}
                            state={states ? (states.get(p.id.toLowerCase()) ?? 'not-installed') : undefined}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
