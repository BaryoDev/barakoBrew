'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useModuleConfiguration } from '@/hooks/use-module-configuration';
import type { ModuleConfigurationEntry } from '@/types/modules';

export const REDACTED_MARKER = 'Redacted';

/**
 * A value is shown as text, never as an input: the card is read only. A redacted value gets an
 * explicit marker, because an empty cell would read as a field somebody forgot to fill in, or one
 * they could type into.
 */
export function ConfigurationValue({ entry }: { entry: ModuleConfigurationEntry }) {
    if (entry.redacted) {
        return (
            <span data-testid="config-redacted" className="text-muted-foreground font-mono text-xs italic">
                {REDACTED_MARKER}
            </span>
        );
    }
    if (entry.value === null || entry.value === '') {
        return <span className="text-muted-foreground text-xs">Not set</span>;
    }
    return <span className="font-mono text-xs break-all">{entry.value}</span>;
}

/**
 * The entries out of a configuration reply, or null when the reply is not shaped like one. The type
 * says `entries` is always an array, but this is a network response from a deployment that may be
 * older or newer than the console, and a 200 with an empty body or another shape must not take the
 * page down. A row that is not an entry with a string key is dropped.
 */
export function readEntries(configuration: unknown): ModuleConfigurationEntry[] | null {
    const entries = (configuration as { entries?: unknown } | null | undefined)?.entries;
    if (!Array.isArray(entries)) return null;
    return entries.filter(
        (e): e is ModuleConfigurationEntry =>
            typeof e === 'object' && e !== null && typeof (e as { key?: unknown }).key === 'string',
    );
}

export function ModuleConfigurationCard({ name, enabled = true }: { name: string; enabled?: boolean }) {
    const { data, isLoading, isError } = useModuleConfiguration(name, enabled);
    const entries = data?.kind === 'configuration' ? readEntries(data.configuration) : null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm font-medium">Configuration</CardTitle>
            </CardHeader>
            <CardContent>
                {!enabled ? (
                    <p className="text-muted-foreground text-sm">
                        Configuration is shown for enabled modules.
                    </p>
                ) : isLoading ? (
                    <Skeleton className="h-16 w-full" />
                ) : isError ? (
                    <p className="text-destructive text-sm">Could not load the configuration.</p>
                ) : data?.kind !== 'configuration' ? (
                    <p className="text-muted-foreground text-sm">
                        The configuration is not available to you on this deployment.
                    </p>
                ) : entries === null ? (
                    <p className="text-destructive text-sm">
                        The API sent a configuration this console cannot read.
                    </p>
                ) : entries.length === 0 ? (
                    <p className="text-muted-foreground text-sm">This module declares no settings to show.</p>
                ) : (
                    <dl className="divide-y">
                        {entries.map((entry) => (
                            <div key={entry.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 py-2">
                                <dt className="min-w-0">
                                    <div className="font-mono text-xs break-all">{entry.key}</div>
                                    <div className="text-muted-foreground text-[11px]">
                                        {entry.scope}, from {entry.source}
                                    </div>
                                </dt>
                                <dd>
                                    <ConfigurationValue entry={entry} />
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
            </CardContent>
        </Card>
    );
}
