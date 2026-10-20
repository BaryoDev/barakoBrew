'use client';

import { PageHeader } from '@/components/patterns/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ModuleCard } from '@/components/modules/module-card';
import { useModules } from '@/hooks/use-modules';
import { groupByCategory } from '@/lib/module-state';

export default function ModulesPage() {
    const { data, isLoading, isError } = useModules();

    return (
        <>
            <PageHeader title="All modules" description="What this deployment carries and what is switched on." />
            {isLoading ? (
                <Skeleton className="h-32 w-full" />
            ) : isError || data?.kind !== 'modules' ? (
                <p className="text-muted-foreground text-sm">The module list is not available to you.</p>
            ) : data.modules.length === 0 ? (
                <p className="text-muted-foreground text-sm">No modules.</p>
            ) : (
                <div className="space-y-6">
                    {groupByCategory(data.modules).map((group) => (
                        <section key={group.category} aria-label={group.category}>
                            <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                                {group.category}
                            </h2>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {group.modules.map((m) => (
                                    <ModuleCard key={m.name} module={m} />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </>
    );
}
