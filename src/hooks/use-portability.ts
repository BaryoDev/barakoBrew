'use client';

import { useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api, type Paginated } from '@/lib/api';
import { useCurrentTenant } from '@/hooks/use-tenants';
import type { ContentTypeDefinition } from '@/types/schema';
import {
    getContractServerState,
    getContractState,
    subscribeToContract,
    type ContractState,
} from '@/lib/api-contract';

/**
 * The first contract version of a core that has the config routes (core 5.0.0). Below it, or when no
 * answer has come back yet, the page keeps calling the portability routes it always called, so a
 * console on a 4.x core loses nothing.
 */
export const CONFIG_ROUTES_CONTRACT = 8;

/** Whether this contract state belongs to a core that serves `/api/config/*`. */
export function usesConfigRoutes(state: ContractState): boolean {
    return (state.kind === 'ok' || state.kind === 'api-newer') && state.version >= CONFIG_ROUTES_CONTRACT;
}

/** Re-renders when a response changes what the API said its contract is. */
export function useConfigRoutes(): boolean {
    return usesConfigRoutes(useSyncExternalStore(subscribeToContract, getContractState, getContractServerState));
}

/**
 * One section of a bundle. The portability routes use arrays. The config export keys each document by
 * its id or name, and the config routes read either shape.
 */
export type BundleSection = unknown[] | Record<string, unknown>;

/** The documents in a section, whichever shape it is in. */
export function sectionValues(section: BundleSection | undefined): unknown[] {
    if (!section) return [];
    return Array.isArray(section) ? section : Object.values(section);
}

export function sectionSize(section: BundleSection | undefined): number {
    return sectionValues(section).length;
}

/**
 * What a file holds: the two sections this page moves, and the format version when it has one. A
 * section the exporting caller may not read is left out of the file, so either may be missing, and
 * the page refuses a file that has neither.
 */
export interface PortabilityBundle {
    version?: number;
    contentTypes?: BundleSection;
    contents?: BundleSection;
}

/**
 * What an export answers. `withheld` names the sections the caller may not read, and those are
 * missing from the answer.
 */
export interface ExportedBundle {
    version?: number;
    contentTypes?: BundleSection;
    contents?: BundleSection;
    withheld?: string[];
    /** Per section, what is stored and could not be exported, in the server's words. */
    gaps?: Record<string, string[]>;
    [key: string]: unknown;
}

/** What the server said an export left out of a section it did write, one line each. */
export function gapLines(bundle: ExportedBundle): string[] {
    return Object.values(bundle.gaps ?? {}).flat();
}

export interface ImportReport {
    dryRun: boolean;
    contentTypesCreated: number;
    contentTypesUpdated: number;
    contentsCreated: number;
    /**
     * Records whose content type is in neither the store nor the bundle. They are still created,
     * but nothing treats their fields as public, so they never appear in public search.
     */
    contentsWithoutContentType: number;
    /** What the config routes refused or could not do, one line each. Empty on the portability routes. */
    problems?: string[];
}

/** An import the server answered by refusing, with each reason as its own line. */
export class ImportRefused extends Error {
    readonly lines: string[];

    constructor(lines: string[]) {
        super(lines.join(' '));
        this.name = 'ImportRefused';
        this.lines = lines;
    }
}

function nameOf(document: unknown): string | null {
    const name = (document as { name?: unknown } | null)?.name;
    return typeof name === 'string' ? name : null;
}

function contentTypeOf(document: unknown): string | null {
    const name = (document as { contentType?: unknown } | null)?.contentType;
    return typeof name === 'string' ? name : null;
}

function keepWhere(section: BundleSection, keep: (key: string, document: unknown) => boolean): BundleSection {
    if (Array.isArray(section)) return section.filter((document, i) => keep(String(i), document));
    return Object.fromEntries(Object.entries(section).filter(([key, document]) => keep(key, document)));
}

/**
 * The export narrowed to some content types: those types and only the entries that belong to them.
 * The config export has no per-type filter, so this is done here, on the answer. Names compare
 * without case, as the portability route's filter did.
 */
export function narrowBundle(bundle: ExportedBundle, types: string[]): ExportedBundle {
    const wanted = new Set(types.map((t) => t.toLowerCase()));
    const narrowed: ExportedBundle = { ...bundle };
    if (bundle.contentTypes) {
        narrowed.contentTypes = keepWhere(bundle.contentTypes, (key, document) =>
            wanted.has((nameOf(document) ?? key).toLowerCase())
        );
    }
    if (bundle.contents) {
        narrowed.contents = keepWhere(bundle.contents, (_key, document) =>
            wanted.has((contentTypeOf(document) ?? '').toLowerCase())
        );
    }
    return narrowed;
}

/**
 * The key core reads a document under: the object key for a keyed section, and for a list the first
 * of name, slug and id that is text (ignoring case in the property name). Null when it has none.
 */
function documentKey(document: unknown): string | null {
    if (typeof document !== 'object' || document === null || Array.isArray(document)) return null;
    for (const wanted of ['name', 'slug', 'id']) {
        for (const [property, value] of Object.entries(document)) {
            if (property.toLowerCase() === wanted && typeof value === 'string' && value.trim() !== '') return value;
        }
    }
    return null;
}

/**
 * The content types a section holds, for the portability route, which takes a list and reads a
 * type's name from the type. The config export keeps a name only as the key, so a keyed type that
 * has no name gets its key as one.
 */
function typesForOldRoute(section: BundleSection | undefined): unknown[] {
    if (!section) return [];
    if (Array.isArray(section)) return section;
    return Object.entries(section).map(([key, document]) =>
        typeof document === 'object' && document !== null && !Array.isArray(document) && !nameOf(document)?.trim()
            ? { ...document, name: key }
            : document
    );
}

/**
 * Entries whose content type is in neither the file nor `knownTypes`, compared without case. The
 * config answers carry no such count, so it is worked out here from what the file and the type list
 * hold. A type in the file is known by the key core would read it under.
 */
export function countWithoutContentType(bundle: PortabilityBundle, knownTypes: readonly string[]): number {
    const known = new Set(knownTypes.map((t) => t.toLowerCase()));

    const types = bundle.contentTypes;
    const names = !types
        ? []
        : Array.isArray(types)
          ? types.map(documentKey)
          : Object.keys(types);
    for (const name of names) {
        if (name) known.add(name.toLowerCase());
    }

    return sectionValues(bundle.contents).filter((document) => !known.has((contentTypeOf(document) ?? '').toLowerCase()))
        .length;
}

interface ConfigChange {
    key: string;
    kind: string;
    summary?: string;
}

interface ConfigSectionAnswer {
    section: string;
    changes?: ConfigChange[];
    errors?: string[];
    refusals?: string[];
    conflicts?: string[];
}

/** `POST /api/config/plan` and `/apply` answer with this, on a refusal as well as on success. */
interface ConfigAnswer {
    applied?: boolean;
    errors?: string[];
    refusals?: string[];
    sections?: ConfigSectionAnswer[];
}

function changesOf(answer: ConfigAnswer, section: string): ConfigChange[] {
    return answer.sections?.find((s) => s.section === section)?.changes ?? [];
}

/** Each error, refusal and conflict as its own line, and each destructive change, which this page never allows. */
export function linesOf(answer: ConfigAnswer): string[] {
    const lines = [...(answer.errors ?? []), ...(answer.refusals ?? [])];
    for (const section of answer.sections ?? []) {
        for (const line of [...(section.errors ?? []), ...(section.refusals ?? []), ...(section.conflicts ?? [])]) {
            lines.push(`${section.section}: ${line}`);
        }
        for (const change of section.changes ?? []) {
            if (change.kind === 'destructive') {
                lines.push(
                    `${section.section} ${change.key}: ${change.summary || 'a destructive change'}. This page does not apply destructive changes.`
                );
            }
        }
    }
    return lines;
}

function isConfigAnswer(data: unknown): data is ConfigAnswer {
    const answer = data as ConfigAnswer | null;
    return (
        !!answer &&
        typeof answer === 'object' &&
        (Array.isArray(answer.sections) || Array.isArray(answer.errors) || Array.isArray(answer.refusals))
    );
}

/** The existing report, filled from a plan or an apply answer. */
function reportFrom(answer: ConfigAnswer, dryRun: boolean, withoutContentType: number): ImportReport {
    const types = changesOf(answer, 'contentTypes');
    return {
        dryRun,
        contentTypesCreated: types.filter((c) => c.kind === 'create').length,
        contentTypesUpdated: types.filter((c) => c.kind !== 'create').length,
        contentsCreated: changesOf(answer, 'contents').filter((c) => c.kind === 'create').length,
        contentsWithoutContentType: withoutContentType,
        problems: linesOf(answer),
    };
}

export function useExportBundle() {
    return useMutation({
        mutationFn: async (types?: string[]): Promise<ExportedBundle> => {
            if (usesConfigRoutes(getContractState())) {
                const response = await api.get<ExportedBundle>('/api/config/export', {
                    params: { sections: 'contentTypes,contents' },
                });
                return types?.length ? narrowBundle(response.data, types) : response.data;
            }

            const response = await api.get<ExportedBundle>('/api/portability/export', {
                params: types?.length ? { types: types.join(',') } : undefined,
            });
            return response.data;
        },
    });
}

export function useImportBundle() {
    const queryClient = useQueryClient();
    return useMutation({
        // A real import changes the type list and the entries, so what is on screen is read again.
        onSuccess: (_report, input) => {
            if (input.dryRun) return;
            queryClient.invalidateQueries({ queryKey: ['schemas'] });
            queryClient.invalidateQueries({ queryKey: ['contents'] });
        },
        mutationFn: async (input: {
            bundle: PortabilityBundle;
            dryRun: boolean;
            /** Names of the content types this CMS has, or null when that list is not loaded. */
            knownTypes?: string[] | null;
        }) => {
            const { bundle, dryRun } = input;

            if (!usesConfigRoutes(getContractState())) {
                // A section the file does not have goes as an empty list, which every core's import takes.
                const response = await api.post<ImportReport>('/api/portability/import', {
                    dryRun,
                    contentTypes: typesForOldRoute(bundle.contentTypes),
                    contents: sectionValues(bundle.contents),
                });
                return response.data;
            }

            // The config routes read a document that declares its version. A file from before they
            // existed has none, and version 1 is the format it was written in. Never allowDestructive:
            // a destructive change is shown and refused, not applied from here.
            // A section the file does not have is not sent, and the server leaves it as it is.
            const document = {
                version: typeof bundle.version === 'number' ? bundle.version : 1,
                ...(bundle.contentTypes ? { contentTypes: bundle.contentTypes } : {}),
                ...(bundle.contents ? { contents: bundle.contents } : {}),
            };

            try {
                const response = await api.post<ConfigAnswer>(dryRun ? '/api/config/plan' : '/api/config/apply', {
                    document,
                });
                return reportFrom(
                    response.data,
                    dryRun,
                    input.knownTypes ? countWithoutContentType(bundle, input.knownTypes) : 0
                );
            } catch (error) {
                const data: unknown = axios.isAxiosError(error) ? error.response?.data : null;
                if (isConfigAnswer(data)) {
                    const lines = linesOf(data);
                    if (lines.length > 0) throw new ImportRefused(lines);
                }
                throw error;
            }
        },
    });
}

/** The most pages of content types the import warning reads. A hundred a page, so a thousand types. */
export const MAX_TYPE_PAGES = 10;

/**
 * Every content type name, for the import warning. `useSchemas` reads the first page only, which is
 * right for its other callers and wrong here: a type on a later page would make its entries look as
 * if they have no type. Null when more than `MAX_TYPE_PAGES` pages remain, because a partial list
 * would give a wrong count, so the page shows none. The key starts with `schemas`, so anything that
 * refreshes the type lists refreshes this.
 */
export function useAllContentTypeNames(enabled: boolean) {
    const tenant = useCurrentTenant();
    return useQuery({
        queryKey: ['schemas', 'names', tenant],
        enabled,
        queryFn: async (): Promise<string[] | null> => {
            const names: string[] = [];
            for (let page = 1; page <= MAX_TYPE_PAGES; page++) {
                const { data } = await api.get<Paginated<ContentTypeDefinition>>('/api/content-types', {
                    params: { page, pageSize: 100 },
                });
                names.push(...data.items.map((t) => t.name));
                if (!data.hasNextPage) return names;
            }
            return null;
        },
    });
}
