'use client';

import { useMemo, useState } from 'react';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
import { withFirstParty } from '@/lib/module-catalog';
import { categoryCounts, moduleCategory, moduleState, sortModules } from '@/lib/module-state';
import type { ModuleSummary } from '@/types/modules';
import { ModuleCard } from './module-card';

const ALL = 'All';

/** What this deployment carries and what it does not: category filter with counts, then the cards. */
export function ModulesList({ listed }: { listed: readonly ModuleSummary[] }) {
    const [category, setCategory] = useState(ALL);
    const modules = useMemo(() => sortModules(withFirstParty(listed)), [listed]);
    const counts = useMemo(() => categoryCounts(modules), [modules]);
    const shown = category === ALL ? modules : modules.filter((m) => moduleCategory(m) === category);

    return (
        <div className="space-y-4">
            <SegmentedControl
                value={counts.some((c) => c.category === category) ? category : ALL}
                onValueChange={setCategory}
                aria-label="Filter by category"
                className="h-auto flex-wrap"
            >
                <SegmentedControlItem value={ALL} className="h-8">
                    {ALL}
                    <span className="font-mono text-[11px] opacity-70">{modules.length}</span>
                </SegmentedControlItem>
                {counts.map((c) => (
                    <SegmentedControlItem key={c.category} value={c.category} className="h-8">
                        {c.category}
                        <span className="font-mono text-[11px] opacity-70">{c.count}</span>
                    </SegmentedControlItem>
                ))}
            </SegmentedControl>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3">
                {shown.map((m) => (
                    <ModuleCard key={m.name} module={m} />
                ))}
            </div>
        </div>
    );
}

/** The `n of n` in the header chip: modules the API listed as present, out of every module drawn. */
export function installedCount(listed: readonly ModuleSummary[]): { installed: number; total: number } {
    const all = withFirstParty(listed);
    return { installed: all.filter((m) => moduleState(m) !== 'not-installed').length, total: all.length };
}
