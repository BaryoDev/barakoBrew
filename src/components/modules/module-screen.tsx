'use client';

import type { ReactNode } from 'react';
import { PageHeader } from '@/components/patterns/page-header';
import { moduleState } from '@/lib/module-state';
import type { ModuleSummary } from '@/types/modules';
import { ModuleConfigurationCard } from './module-configuration-card';
import { ModuleStateBadge } from './module-state-badge';

/**
 * The template every module page uses: header, status, the Configuration card, then the module's
 * own content as children. A module cannot change the order or add chrome; what it needs beyond
 * this is a new kind in the screen vocabulary, decided for everyone.
 */
export function ModuleScreen({ module, children }: { module: ModuleSummary; children?: ReactNode }) {
    const state = moduleState(module);

    return (
        <>
            <PageHeader
                title={module.name}
                description={module.description}
                badge={<ModuleStateBadge state={state} />}
            />
            <div className="space-y-4">
                <ModuleConfigurationCard name={module.name} enabled={state === 'enabled'} />
                {children}
            </div>
        </>
    );
}
