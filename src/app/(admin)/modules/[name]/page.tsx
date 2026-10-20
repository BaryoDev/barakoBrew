'use client';

import { use } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ModuleScreen } from '@/components/modules/module-screen';
import { useModules } from '@/hooks/use-modules';

export default function ModulePage({ params }: { params: Promise<{ name: string }> }) {
    const { name } = use(params);
    const moduleName = decodeURIComponent(name);
    const { data, isLoading } = useModules();

    if (isLoading) return <Skeleton className="h-32 w-full" />;
    const found = data?.kind === 'modules' ? data.modules.find((m) => m.name === moduleName) : undefined;
    if (!found) {
        return <p className="text-muted-foreground text-sm">This module is not on this deployment.</p>;
    }
    return <ModuleScreen module={found} />;
}
