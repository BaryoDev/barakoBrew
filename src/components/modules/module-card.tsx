import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { moduleHref, moduleState } from '@/lib/module-state';
import type { ModuleSummary } from '@/types/modules';
import { CopyInstallLine } from './copy-install-line';
import { ModuleStateBadge } from './module-state-badge';

/**
 * One module on the All modules page. A module that is not installed has no screen to open, so its
 * name is not a link. Installed but not enabled does open, to read what it would run with.
 */
export function ModuleCard({ module }: { module: ModuleSummary }) {
    const state = moduleState(module);

    return (
        <Card data-testid="module-card" data-state={state} className="gap-3 py-4">
            <CardHeader className="gap-1">
                <div className="flex items-start justify-between gap-2">
                    <CardTitle className="min-w-0 truncate text-sm">
                        {state === 'not-installed' ? (
                            module.name
                        ) : (
                            <Link href={moduleHref(module.name)} className="hover:underline">
                                {module.name}
                            </Link>
                        )}
                    </CardTitle>
                    <ModuleStateBadge state={state} />
                </div>
                {(module.package || module.version) && (
                    <p className="text-muted-foreground font-mono text-xs">
                        {[module.package, module.version].filter(Boolean).join(' ')}
                    </p>
                )}
            </CardHeader>
            <CardContent className="space-y-3">
                {module.description && (
                    <p className="text-muted-foreground text-sm">{module.description}</p>
                )}
                {state === 'not-installed' && <CopyInstallLine module={module} />}
            </CardContent>
        </Card>
    );
}
