'use client';

import { useSyncExternalStore } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '@/lib/api';
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
export function sectionValues(section: BundleSection): unknown[] {
    return Array.isArray(section) ? section : Object.values(section);
}

export function sectionSize(section: BundleSection): number {
    return sectionValues(section).length;
}

/** What a file holds: the two sections this page moves, and the format version when it has one. */
export interface PortabilityBundle {
    version?: number;
    contentTypes: BundleSection;
    contents: BundleSection;
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
    [key: string]: unknown;
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
 * Entries whose content type is in neither the file nor `knownTypes`, compared without case. The
 * config answers carry no such count, so it is worked out here from what the file and the type list
 * hold.
 */
export function countWithoutContentType(bundle: PortabilityBundle, knownTypes: readonly string[]): number {
    const known = new Set(knownTypes.map((t) => t.toLowerCase()));

    const entries = Array.isArray(bundle.contentTypes)
        ? bundle.contentTypes.map((document) => [null, document] as const)
        : Object.entries(bundle.contentTypes);
    for (const [key, document] of entries) {
        const name = nameOf(document) ?? key;
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
    return useMutation({
        mutationFn: async (input: {
            bundle: PortabilityBundle;
            dryRun: boolean;
            /** Names of the content types this CMS has, or null when that list is not loaded. */
            knownTypes?: string[] | null;
        }) => {
            const { bundle, dryRun } = input;

            if (!usesConfigRoutes(getContractState())) {
                const response = await api.post<ImportReport>('/api/portability/import', {
                    dryRun,
                    contentTypes: sectionValues(bundle.contentTypes),
                    contents: sectionValues(bundle.contents),
                });
                return response.data;
            }

            // The config routes read a document that declares its version. A file from before they
            // existed has none, and version 1 is the format it was written in. Never allowDestructive:
            // a destructive change is shown and refused, not applied from here.
            const document = {
                version: typeof bundle.version === 'number' ? bundle.version : 1,
                contentTypes: bundle.contentTypes,
                contents: bundle.contents,
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
