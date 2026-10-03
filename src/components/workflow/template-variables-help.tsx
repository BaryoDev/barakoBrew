import { Badge } from '@/components/ui/badge';
import type { TemplateVariableCollection } from '@/types/workflow';

/**
 * What a workflow action parameter can hold between `{{` and `}}`, as the API lists it for the
 * trigger type: the names (the entry, its author and, on a transition, who made it and when), and
 * the formats and durations, each shown as an example to adapt.
 */
export function TemplateVariablesHelp({ variables }: { variables: TemplateVariableCollection | undefined }) {
    if (!variables) return null;
    const names = [...variables.systemVariables, ...variables.dataFields];
    const formats = variables.formats ?? [];
    if (names.length === 0 && formats.length === 0) return null;

    return (
        <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer">Available template variables</summary>
            {names.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {names.map((variable) => (
                        <Badge
                            key={variable.name}
                            variant="secondary"
                            className="font-mono font-normal"
                            title={variable.description}
                        >
                            {variable.name}
                        </Badge>
                    ))}
                </div>
            )}
            {formats.length > 0 && (
                <>
                    <p className="text-muted-foreground mt-3 text-xs">
                        Formats and durations. Swap in the field or date you want; anything else between the
                        braces is sent as written.
                    </p>
                    <dl className="mt-1.5 space-y-1.5" aria-label="Formats and durations">
                        {formats.map((format) => (
                            <div key={format.name}>
                                <dt className="font-mono text-xs">{format.name}</dt>
                                <dd className="text-muted-foreground text-xs">
                                    {format.description}
                                    {format.example ? `. For example: ${format.example}` : ''}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </>
            )}
        </details>
    );
}
