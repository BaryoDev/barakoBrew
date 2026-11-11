import { Card } from '@/components/ui/card';
import type { NugetPackage } from '@/lib/nuget';
import type { ModuleState } from '@/lib/module-state';
import { cn } from '@/lib/utils';
import { installLine } from '@/lib/module-state';
import { CopyInstallLine } from './copy-install-line';
import { ModuleStateBadge } from './module-state-badge';
import { ModuleTile } from './module-tile';

const downloadsFormat = new Intl.NumberFormat('en-US');

/**
 * One NuGet package under the `barakocms-module` tag. Every field is text: the description is
 * never parsed as markup, the icon is the generic tile, and the links are the NuGet page built from
 * the id and the package's own project link only when it is `https:`. Ours and community packages
 * go through here the same way.
 *
 * `state` is undefined when the deployment's module list is not readable, which shows no claim
 * either way. There is no Install button: the console cannot add a package to a running API.
 */
export function BrowseCard({ pkg, state }: { pkg: NugetPackage; state: ModuleState | undefined }) {
    const installed = state === 'enabled' || state === 'installed';
    return (
        <Card
            data-testid="browse-card"
            data-state={state ?? 'unknown'}
            className={cn('gap-3 p-[18px]', state === 'not-installed' && 'opacity-[.78]')}
        >
            <div className="flex items-center gap-3">
                <ModuleTile muted={!installed} />
                <div className="grid min-w-0 flex-1 gap-0.5">
                    <h2 className="truncate text-[15px] font-semibold">{pkg.title}</h2>
                    <span className="text-muted-foreground truncate text-[12.5px]">
                        {pkg.publisher || 'Unknown publisher'}
                    </span>
                </div>
                {state && <ModuleStateBadge state={state} />}
            </div>
            {pkg.description && (
                <p className="text-muted-foreground line-clamp-3 text-[13.5px] leading-normal">{pkg.description}</p>
            )}
            <p className="text-muted-foreground font-mono text-xs break-all">
                {pkg.id}
                {pkg.version && ` ${pkg.version}`}
                {pkg.downloads !== null && ` · ${downloadsFormat.format(pkg.downloads)} downloads`}
            </p>
            {!installed && installLine({ packageId: pkg.id }) && (
                <code className="bg-secondary text-muted-foreground rounded-md px-2 py-1 font-mono text-xs break-all">
                    {installLine({ packageId: pkg.id })}
                </code>
            )}
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
                <a
                    href={pkg.nugetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`NuGet page for ${pkg.id}`}
                    className="text-primary font-medium hover:underline"
                >
                    NuGet page
                </a>
                {pkg.projectUrl && (
                    <a
                        href={pkg.projectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Project site for ${pkg.id}`}
                        className="text-primary font-medium hover:underline"
                    >
                        Project site
                    </a>
                )}
                {!installed && <span className="ml-auto"><CopyInstallLine module={{ packageId: pkg.id }} /></span>}
            </div>
        </Card>
    );
}
