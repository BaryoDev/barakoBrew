'use client';

import { useSiteEntry, useSaveSite } from '@/hooks/use-site';
import { saveConcurrently, type SaveBase } from '@/lib/concurrent-save';
import { presetsFrom, upsertPreset, PRESETS_FIELD, type BlockPreset } from '@/lib/presets';
import { ContentStatus } from '@/types/content';

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
 *
 * This is the fourth writer of that one entry, after Site, Theme and the block editor's own reads,
 * so it saves through the same concurrent flow: somebody saving the Site screen between this read
 * and this write no longer costs the preset, and two people saving a preset at once is refused
 * rather than one of them quietly winning.
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
    const refetch = site.kind === 'entry' ? site.refetch : null;

    return {
        presets,
        save: async (preset) => {
            const base: SaveBase & { status: ContentStatus } = {
                data: entry?.data ?? {},
                version: entry?.version ?? 0,
                etag: entry?.etag,
                status: entry?.status ?? ContentStatus.Draft,
            };

            await saveConcurrently({
                base,
                edit: { ...base.data, [PRESETS_FIELD]: upsertPreset(base.data[PRESETS_FIELD], preset) },
                read: async () => {
                    const fresh = await refetch?.();
                    if (!fresh) throw new Error('The site entry could not be read back.');
                    return { data: fresh.data, version: fresh.version, etag: fresh.etag, status: fresh.status };
                },
                write: (data, against) =>
                    save.mutateAsync({
                        entry: entry
                            ? { ...entry, data, version: against.version, etag: against.etag, status: against.status }
                            : null,
                        changes: data,
                    }),
            });
        },
    };
}
