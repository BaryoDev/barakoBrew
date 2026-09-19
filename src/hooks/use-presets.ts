'use client';

import { useSiteEntry, useSaveSite } from '@/hooks/use-site';
import { presetsFrom, upsertPreset, PRESETS_FIELD, type BlockPreset } from '@/lib/presets';

export type PresetsState = {
    presets: BlockPreset[];
    /** Null when this tenant cannot store presets, with `reason` saying why. */
    save: ((preset: BlockPreset) => Promise<void>) | null;
    reason?: string;
};

/**
 * The tenant's presets, read from and written to the `Presets` field of its `site` entry.
 *
 * The same field barakoPress reads, so a preset saved here is offered by the site on its next
 * request. Saving goes through the ordinary site save, which sends the whole stored document with
 * the change laid over it, because the Site and Theme screens own the rest of it.
 *
 * A tenant whose `site` type has no `Presets` field cannot store one: the API checks an entry
 * against its type. That is a note rather than an error, the way the Site screen treats a setting
 * its type does not declare.
 */
export function usePresets(): PresetsState {
    const site = useSiteEntry();
    const save = useSaveSite();

    const entry = site.kind === 'entry' ? site.entry : null;
    const presets = presetsFrom(entry?.data?.[PRESETS_FIELD]);

    if (site.kind === 'loading') return { presets: [], save: null, reason: 'Reading this site’s saved blocks.' };
    if (site.kind === 'no-type') {
        return {
            presets,
            save: null,
            reason: 'This tenant has no site settings, so a saved block has nowhere to live.',
        };
    }
    if (site.kind === 'error') {
        return { presets, save: null, reason: 'The site settings could not be read, so saved blocks are not listed.' };
    }
    const schema = site.kind === 'entry' || site.kind === 'no-entry' ? site.schema : undefined;
    if (schema && !schema.fields.some((f) => f.name === PRESETS_FIELD)) {
        return {
            presets,
            save: null,
            reason: `Add a JSON field called ${PRESETS_FIELD} to the site type to save blocks for reuse.`,
        };
    }
    return {
        presets,
        save: async (preset) => {
            await save.mutateAsync({
                entry,
                changes: { [PRESETS_FIELD]: upsertPreset(entry?.data?.[PRESETS_FIELD], preset) },
            });
        },
    };
}
