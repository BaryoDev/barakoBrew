'use client';

import { use } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ModuleScreen } from '@/components/modules/module-screen';
import { ModuleScreenSlot, useHasModuleScreen } from '@/components/modules/module-screen-slot';
import { useModules } from '@/hooks/use-modules';

export default function ModulePage({ params }: { params: Promise<{ name: string }> }) {
    const { name } = use(params);
    const moduleName = decodeURIComponent(name);
    const { data, isLoading } = useModules();
    const hasScreen = useHasModuleScreen(moduleName);

    if (isLoading) return <Skeleton className="h-32 w-full" />;
    const found = data?.kind === 'modules' ? data.modules.find((m) => m.name === moduleName) : undefined;
    if (!found) {
        return <p className="text-muted-foreground text-sm">This module is not on this deployment.</p>;
    }
    // A registered screen replaces the template's table body; the header and Configuration card stay.
    if (hasScreen) {
        return (
            <ModuleScreen module={found}>
                <ModuleScreenSlot name={moduleName} />
            </ModuleScreen>
        );
    }
    return <ModuleScreen module={found} />;
}
