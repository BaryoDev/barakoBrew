'use client';

import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/patterns/status-badge';
import { moduleDisplayName, moduleGlyph } from '@/lib/module-catalog';
import { moduleState } from '@/lib/module-state';
import { cn } from '@/lib/utils';
import type { ModuleSummary } from '@/types/modules';
import { ModuleAdapterBody } from './module-adapters';
import { ModuleConfigurationCard } from './module-configuration-card';
import { ModuleStateBadge } from './module-state-badge';
import { GLYPH } from './module-tile';

function Header({ module }: { module: ModuleSummary }) {
    const state = moduleState(module);
    const Glyph = GLYPH[moduleGlyph(module)];
    const pkg = [module.packageId, module.packageVersion].filter(Boolean).join(' ');
    return (
        <div className="mb-6 flex items-start gap-4" data-testid="module-header">
            <span
                aria-hidden
                className={cn(
                    'flex size-[60px] shrink-0 items-center justify-center rounded-[14px]',
                    'bg-accent text-accent-foreground',
                )}
            >
                <Glyph className="size-8" />
            </span>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="font-display text-[32px] leading-[1.1] font-semibold tracking-[-0.035em]">
                        {moduleDisplayName(module)}
                    </h1>
                    {state === 'not-installed' ? (
                        <ModuleStateBadge state={state} />
                    ) : (
                        <>
                            <StatusBadge tone="success">Detected</StatusBadge>
                            {state === 'installed' && <ModuleStateBadge state={state} />}
                        </>
                    )}
                    {pkg && (
                        <span className="bg-secondary text-muted-foreground rounded-full px-2.5 py-0.5 font-mono text-[11.5px]">
                            {pkg}
                        </span>
                    )}
                </div>
                {module.description && (
                    <p className="text-muted-foreground mt-1.5 text-[13.5px]">{module.description}</p>
                )}
            </div>
        </div>
    );
}

/**
 * The one template every module page uses: header, three stats, the table card, and the
 * Configuration card in the right column. A module cannot change the order or add chrome. A module
 * with no list this console can read keeps the header and shows an honest empty state.
 * `children`, when given, replace the table body and keep the Configuration card above them.
 */
export function ModuleScreen({ module, children }: { module: ModuleSummary; children?: ReactNode }) {
    const state = moduleState(module);
    const config = <ModuleConfigurationCard name={module.name} enabled={state === 'enabled'} />;

    return (
        <>
            <Header module={module} />
            {children ? (
                <div className="space-y-4">
                    {config}
                    {children}
                </div>
            ) : (
                <ModuleAdapterBody name={module.name} side={config} />
            )}
        </>
    );
}
