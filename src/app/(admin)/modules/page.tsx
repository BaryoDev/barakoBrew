'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/patterns/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
import { BrowseModules } from '@/components/modules/browse-modules';
import { ModulesList, installedCount } from '@/components/modules/modules-list';
import { useModules } from '@/hooks/use-modules';

type View = 'deployment' | 'browse';

export default function ModulesPage() {
    const { data, isLoading, isError } = useModules();
    const [view, setView] = useState<View>('deployment');
    const counts = data?.kind === 'modules' ? installedCount(data.modules) : null;

    return (
        <>
            <PageHeader
                title="Modules"
                description="barakoBrew finds modules by asking the API what it runs. A module that is installed gets its screen; one that is not shows how to add it."
                actions={
                    counts && (
                        <code className="bg-secondary text-muted-foreground rounded-[10px] px-3 py-2 font-mono text-[12.5px]">
                            GET /api/modules · {counts.installed} of {counts.total}
                        </code>
                    )
                }
            />
            <SegmentedControl
                value={view}
                onValueChange={(v) => setView(v as View)}
                aria-label="Modules view"
                className="mb-4"
            >
                <SegmentedControlItem value="deployment">This deployment</SegmentedControlItem>
                <SegmentedControlItem value="browse">Browse</SegmentedControlItem>
            </SegmentedControl>
            {view === 'browse' ? (
                <BrowseModules />
            ) : isLoading ? (
                <Skeleton className="h-32 w-full" />
            ) : isError || data?.kind !== 'modules' ? (
                <p className="text-muted-foreground text-sm">The module list is not available to you.</p>
            ) : (
                <ModulesList listed={data.modules} />
            )}
        </>
    );
}
