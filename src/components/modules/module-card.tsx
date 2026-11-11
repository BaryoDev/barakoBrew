import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { installLine, moduleCategory, moduleHref, moduleState } from '@/lib/module-state';
import { cn } from '@/lib/utils';
import type { ModuleSummary } from '@/types/modules';
import { CopyInstallLine } from './copy-install-line';
import { ModuleStateBadge } from './module-state-badge';
import { ModuleTile } from './module-tile';

/**
 * One module on the All modules page. A module that is not installed has no screen to open, so it
 * gets the install line instead of an Open button. Installed but not enabled does open, to read
 * what it would run with.
 */
export function ModuleCard({ module }: { module: ModuleSummary }) {
    const state = moduleState(module);
    const missing = state === 'not-installed';
    const meta = missing
        ? installLine(module)
        : [module.package, module.version].filter(Boolean).join(' ');

    return (
        <Card
            data-testid="module-card"
            data-state={state}
            className={cn('gap-3 p-[18px] transition-transform hover:-translate-y-0.5', missing && 'opacity-[.78]')}
        >
            <div className="flex items-center gap-3">
                <ModuleTile module={module} muted={missing} />
                <div className="grid min-w-0 flex-1 gap-0.5">
                    <h2 className="truncate text-[15px] font-semibold">{module.name}</h2>
                    <span className="text-muted-foreground text-[12.5px]">{moduleCategory(module)}</span>
                </div>
                <ModuleStateBadge state={state} />
            </div>
            {module.description && <p className="text-muted-foreground text-[13.5px] leading-normal">{module.description}</p>}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs" title={meta || undefined}>
                    {meta}
                </span>
                {missing ? (
                    <CopyInstallLine module={module} />
                ) : (
                    <Button asChild size="sm">
                        <Link href={moduleHref(module.name)} aria-label={`Open ${module.name}`}>
                            Open
                        </Link>
                    </Button>
                )}
            </div>
        </Card>
    );
}
