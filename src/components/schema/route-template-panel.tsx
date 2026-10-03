'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useSetRouteTemplate } from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import { routeTemplateProblem } from '@/lib/field-presentation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Where a type's entries live on the site, such as `/blog/{slug}`. The feed and the sitemap build
 * links from it; empty falls back to the server's setting.
 */
export function RouteTemplatePanel({ typeName, current }: { typeName: string; current: string | null | undefined }) {
    const [template, setTemplate] = useState(current ?? '');
    const [refusal, setRefusal] = useState<string | null>(null);
    const setRouteTemplate = useSetRouteTemplate(typeName);
    const issue = routeTemplateProblem(template);
    const unchanged = template === (current ?? '');

    const save = () =>
        setRouteTemplate.mutate(template || null, {
            onSuccess: () => toast.success(template ? 'Path saved' : 'Path cleared'),
            onError: (error) => setRefusal(apiErrorMessage(error, 'The path could not be saved.')),
        });

    return (
        <div className="mb-6 space-y-2 rounded-lg border p-4">
            <Label htmlFor="routeTemplate">Path on the site</Label>
            <div className="flex items-center gap-2">
                <Input
                    id="routeTemplate"
                    value={template}
                    placeholder={`/${typeName}/{slug}`}
                    className="font-mono"
                    onChange={(e) => {
                        setRefusal(null);
                        setTemplate(e.target.value.trim());
                    }}
                />
                <Button
                    type="button"
                    size="sm"
                    disabled={!!issue || unchanged || setRouteTemplate.isPending}
                    onClick={save}
                >
                    {setRouteTemplate.isPending ? 'Saving...' : 'Save path'}
                </Button>
            </div>
            <p className="text-muted-foreground text-sm">
                Holds {'{slug}'} once. The feed and the sitemap link entries here, after up to a minute. Empty
                uses the server&apos;s setting.
            </p>
            {issue && <p className="text-destructive text-sm">{issue}</p>}
            {refusal && (
                <p role="alert" className="text-destructive text-sm">
                    {refusal}
                </p>
            )}
        </div>
    );
}
