'use client';

import { Section, TextField } from '@/components/site/editors';
import { Label } from '@/components/ui/label';
import { usePageTree } from '@/hooks/use-pages';
import {
    HOLDING_PATH_FIELD,
    SITE_MODE_FIELD,
    holdingPageOptions,
    modeOptions,
    readMode,
} from '@/lib/site-mode';
import type { ContentTypeDefinition } from '@/types/schema';

const SELECT =
    'border-input bg-transparent dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] sm:w-72';

const HOLDING_HINT = 'Leave empty for the default holding page.';

/**
 * Mode and the holding page. Each control shows only when the site type has its field, because an
 * API from before site mode has neither and would store whatever the screen sent under a name
 * nothing reads.
 */
export function SiteModeSection({
    values,
    set,
    schema,
}: {
    values: Record<string, unknown>;
    set: (field: string, value: unknown) => void;
    schema: ContentTypeDefinition;
}) {
    const modeField = schema.fields.find((f) => f.name === SITE_MODE_FIELD);
    const holdingField = schema.fields.find((f) => f.name === HOLDING_PATH_FIELD);
    const tree = usePageTree();

    if (!modeField && !holdingField) return null;

    const holding = typeof values[HOLDING_PATH_FIELD] === 'string' ? (values[HOLDING_PATH_FIELD] as string) : '';
    const pages = holdingPageOptions(tree.data);
    const usePicker = tree.isLoading || pages.length > 0;

    return (
        <Section title="Site mode" description="What visitors see: the site, or one holding page on every route.">
            {modeField && (
                <div className="space-y-1.5">
                    <Label htmlFor="site-mode">Mode</Label>
                    <select
                        id="site-mode"
                        className={SELECT}
                        value={readMode(values[SITE_MODE_FIELD])}
                        aria-describedby="site-mode-hint"
                        onChange={(e) => set(SITE_MODE_FIELD, e.target.value)}
                    >
                        {modeOptions(modeField, values[SITE_MODE_FIELD]).map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <p id="site-mode-hint" className="text-muted-foreground text-xs">
                        Holding changes what visitors see and hides nothing at the API. Unpublished content stays
                        hidden until it is published.
                    </p>
                </div>
            )}

            {holdingField &&
                (usePicker ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="site-holding-path">Holding page</Label>
                        <select
                            id="site-holding-path"
                            className={SELECT}
                            value={holding}
                            disabled={tree.isLoading}
                            aria-describedby="site-holding-path-hint"
                            onChange={(e) => set(HOLDING_PATH_FIELD, e.target.value)}
                        >
                            <option value="">Default holding page</option>
                            {pages.map((page) => (
                                <option key={page.path} value={page.path}>
                                    {page.label}
                                </option>
                            ))}
                            {holding !== '' && !pages.some((p) => p.path === holding) && (
                                <option value={holding}>{holding} (not in the page tree)</option>
                            )}
                        </select>
                        <p id="site-holding-path-hint" className="text-muted-foreground text-xs">
                            {HOLDING_HINT}
                        </p>
                    </div>
                ) : (
                    <TextField
                        id="site-holding-path"
                        label="Holding page"
                        placeholder="/coming-soon"
                        hint={`A page path. ${HOLDING_HINT}`}
                        value={holding}
                        onChange={(v) => set(HOLDING_PATH_FIELD, v)}
                    />
                ))}
        </Section>
    );
}
