import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { AxiosError, AxiosHeaders } = await import('axios');
const { __resetContractForTests, recordContractVersion } = await import('@/lib/api-contract');
const {
    ImportRefused,
    countWithoutContentType,
    linesOf,
    narrowBundle,
    gapLines,
    sectionValues,
    usesConfigRoutes,
    useExportBundle,
    useImportBundle,
} = await import('./use-portability');

function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return React.createElement(QueryClientProvider, { client }, children);
}

function plan(sections: unknown[] = [], extra: Record<string, unknown> = {}) {
    return { applied: false, errors: [], refusals: [], sections, ...extra };
}

function section(name: string, changes: { key: string; kind: string; summary?: string }[], extra: Record<string, unknown> = {}) {
    return { section: name, changes, errors: [], refusals: [], conflicts: [], ...extra };
}

function refused(status: number, data: unknown) {
    return new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        statusText: '',
        data,
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

function postedBody(call = 0) {
    return vi.mocked(api.post).mock.calls[call][1] as Record<string, unknown>;
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    __resetContractForTests();
});

describe('which routes are used', () => {
    it('uses the config routes from contract 8, and not below it or before an answer', () => {
        expect(usesConfigRoutes({ kind: 'ok', version: 8 })).toBe(true);
        expect(usesConfigRoutes({ kind: 'ok', version: 12 })).toBe(true);
        expect(usesConfigRoutes({ kind: 'api-newer', version: 40 })).toBe(true);
        expect(usesConfigRoutes({ kind: 'ok', version: 7 })).toBe(false);
        expect(usesConfigRoutes({ kind: 'api-older', version: 0 })).toBe(false);
        expect(usesConfigRoutes({ kind: 'absent' })).toBe(false);
        expect(usesConfigRoutes({ kind: 'unknown' })).toBe(false);
    });

    it('exports from the config route on contract 8 and asks for both sections', async () => {
        recordContractVersion('8');
        vi.mocked(api.get).mockResolvedValue({ data: { version: 1, contentTypes: {}, contents: {} } });
        const { result } = renderHook(() => useExportBundle(), { wrapper });

        await result.current.mutateAsync(undefined);

        expect(api.get).toHaveBeenCalledWith('/api/config/export', { params: { sections: 'contentTypes,contents' } });
    });

    it('exports from the portability route below contract 8, narrowed by the server', async () => {
        recordContractVersion('7');
        vi.mocked(api.get).mockResolvedValue({ data: { contentTypes: [], contents: [] } });
        const { result } = renderHook(() => useExportBundle(), { wrapper });

        await result.current.mutateAsync(['Post', 'Page']);

        expect(api.get).toHaveBeenCalledWith('/api/portability/export', { params: { types: 'Post,Page' } });
    });

    it('exports from the portability route when no response has said what the contract is', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { contentTypes: [], contents: [] } });
        const { result } = renderHook(() => useExportBundle(), { wrapper });

        await result.current.mutateAsync(undefined);

        expect(vi.mocked(api.get).mock.calls[0][0]).toBe('/api/portability/export');
    });

    it('imports through the portability route below contract 8, as arrays', async () => {
        recordContractVersion('4');
        const report = { dryRun: true, contentTypesCreated: 1, contentTypesUpdated: 0, contentsCreated: 2, contentsWithoutContentType: 0 };
        vi.mocked(api.post).mockResolvedValue({ data: report });
        const { result } = renderHook(() => useImportBundle(), { wrapper });

        const answer = await result.current.mutateAsync({
            bundle: { contentTypes: { post: { name: 'post' } }, contents: [{ contentType: 'post' }] },
            dryRun: true,
        });

        expect(api.post).toHaveBeenCalledTimes(1);
        expect(vi.mocked(api.post).mock.calls[0][0]).toBe('/api/portability/import');
        expect(postedBody()).toEqual({ dryRun: true, contentTypes: [{ name: 'post' }], contents: [{ contentType: 'post' }] });
        expect(answer).toEqual(report);
    });

    it('names a keyed type by its key on the portability route, which skips a type with no name', async () => {
        recordContractVersion('4');
        vi.mocked(api.post).mockResolvedValue({ data: { dryRun: false } });
        const { result } = renderHook(() => useImportBundle(), { wrapper });

        await result.current.mutateAsync({
            bundle: {
                contentTypes: { Post: { fields: [] }, Page: { name: 'Page', fields: [] }, Note: { name: ' ', fields: [] } },
                contents: [],
            },
            dryRun: false,
        });

        expect(postedBody().contentTypes).toEqual([
            { fields: [], name: 'Post' },
            { name: 'Page', fields: [] },
            { name: 'Note', fields: [] },
        ]);
    });

    it('sends an empty list for a section the file does not have', async () => {
        recordContractVersion('4');
        vi.mocked(api.post).mockResolvedValue({ data: { dryRun: true } });
        const { result } = renderHook(() => useImportBundle(), { wrapper });

        await result.current.mutateAsync({ bundle: { contentTypes: [{ name: 'post' }] }, dryRun: true });
        await result.current.mutateAsync({ bundle: { contents: [{ contentType: 'post' }] }, dryRun: true });

        expect(postedBody(0)).toEqual({ dryRun: true, contentTypes: [{ name: 'post' }], contents: [] });
        expect(postedBody(1)).toEqual({ dryRun: true, contentTypes: [], contents: [{ contentType: 'post' }] });
    });
});

describe('exporting on the config routes', () => {
    const exported = {
        version: 1,
        exportedAt: '2026-11-28T00:00:00Z',
        gaps: {},
        withheld: [],
        contentTypes: { post: { name: 'Post' }, page: { name: 'Page' }, note: { name: 'Note' } },
        contents: {
            a: { contentType: 'post', data: {}, status: 'Published' },
            b: { contentType: 'Page', data: {}, status: 'Draft' },
            c: { contentType: 'note', data: {}, status: 'Draft' },
        },
    };

    it('hands back the document as answered when no types are chosen', async () => {
        recordContractVersion('8');
        vi.mocked(api.get).mockResolvedValue({ data: exported });
        const { result } = renderHook(() => useExportBundle(), { wrapper });

        expect(await result.current.mutateAsync(undefined)).toEqual(exported);
    });

    it('narrows to the chosen types and the entries that belong to them, without case', async () => {
        recordContractVersion('8');
        vi.mocked(api.get).mockResolvedValue({ data: exported });
        const { result } = renderHook(() => useExportBundle(), { wrapper });

        const narrowed = await result.current.mutateAsync(['POST', 'page']);

        expect(Object.keys(narrowed.contentTypes ?? {})).toEqual(['post', 'page']);
        expect(Object.keys(narrowed.contents ?? {})).toEqual(['a', 'b']);
        expect(narrowed.version).toBe(1);
    });

    it('narrows arrays too, and leaves a withheld section missing', () => {
        const narrowed = narrowBundle(
            {
                version: 1,
                withheld: ['contents'],
                contentTypes: [{ name: 'Post' }, { name: 'Note' }],
            },
            ['post']
        );

        expect(narrowed.contentTypes).toEqual([{ name: 'Post' }]);
        expect(narrowed.contents).toBeUndefined();
        expect(narrowed.withheld).toEqual(['contents']);
    });
});

describe('importing on the config routes', () => {
    const answer = plan([
        section('contentTypes', [
            { key: 'post', kind: 'create' },
            { key: 'page', kind: 'create' },
            { key: 'note', kind: 'change' },
        ]),
        section('contents', [
            { key: '#0', kind: 'create' },
            { key: '#1', kind: 'create' },
        ]),
    ]);

    beforeEach(() => {
        recordContractVersion('8');
        vi.mocked(api.post).mockResolvedValue({ data: answer });
    });

    async function run(input: Parameters<ReturnType<typeof useImportBundle>['mutateAsync']>[0]) {
        const { result } = renderHook(() => useImportBundle(), { wrapper });
        return result.current.mutateAsync(input);
    }

    it('plans a dry run and applies a real import, each with the document alone', async () => {
        const bundle = { version: 1, contentTypes: [], contents: [] };

        await run({ bundle, dryRun: true });
        await run({ bundle, dryRun: false });

        expect(vi.mocked(api.post).mock.calls.map(([url]) => url)).toEqual(['/api/config/plan', '/api/config/apply']);
        expect(Object.keys(postedBody(0))).toEqual(['document']);
        // Destructive changes are never allowed from here.
        expect(Object.keys(postedBody(1))).toEqual(['document']);
        expect(JSON.stringify(vi.mocked(api.post).mock.calls)).not.toContain('allowDestructive');
    });

    it('sets version 1 on a file with none, and keeps the one a file declares', async () => {
        await run({ bundle: { contentTypes: [], contents: [] }, dryRun: true });
        await run({ bundle: { version: 2, contentTypes: [], contents: [] }, dryRun: true });

        expect((postedBody(0).document as { version: number }).version).toBe(1);
        expect((postedBody(1).document as { version: number }).version).toBe(2);
    });

    it.each([
        ['an old file with no version', { contentTypes: [{ name: 'post' }], contents: [{ contentType: 'post', data: {}, status: 'Draft' }] }],
        ['an old file with version 1', { version: 1, contentTypes: [{ name: 'post' }], contents: [{ contentType: 'post', data: {}, status: 'Draft' }] }],
        [
            'a file saved by the config export',
            { version: 1, contentTypes: { post: { name: 'post' } }, contents: { 'id-1': { contentType: 'post', data: {}, status: 'Draft' } } },
        ],
    ])('sends %s through plan and then apply as it is', async (_name, bundle) => {
        await run({ bundle, dryRun: true });
        await run({ bundle, dryRun: false });

        for (const call of [0, 1]) {
            const document = postedBody(call).document as Record<string, unknown>;
            expect(document.version).toBe(1);
            expect(document.contentTypes).toEqual(bundle.contentTypes);
            expect(document.contents).toEqual(bundle.contents);
        }
    });

    it('maps the answer onto the report by section and kind', async () => {
        const report = await run({ bundle: { contentTypes: [], contents: [] }, dryRun: true });

        expect(report).toMatchObject({
            dryRun: true,
            contentTypesCreated: 2,
            contentTypesUpdated: 1,
            contentsCreated: 2,
            contentsWithoutContentType: 0,
            problems: [],
        });
    });

    it('counts entries with no content type in the browser, from the file and the type list', async () => {
        const bundle = {
            contentTypes: { Article: { name: 'Article' } },
            contents: [
                { contentType: 'article' },
                { contentType: 'POST' },
                { contentType: 'ghost' },
                { data: {} },
            ],
        };

        const report = await run({ bundle, dryRun: true, knownTypes: ['Post'] });

        expect(report.contentsWithoutContentType).toBe(2);
        expect(countWithoutContentType(bundle, ['Post'])).toBe(2);
    });

    it('counts a type in the file by the key core reads it under', () => {
        const contents = [{ contentType: 'a' }, { contentType: 'b' }, { contentType: 'c' }, { contentType: 'd' }];

        // A list is keyed by name, then slug, then id, and a keyed section by its keys.
        expect(countWithoutContentType({ contentTypes: [{ slug: 'a' }, { id: 'b' }, { name: 'c', slug: 'x' }], contents }, [])).toBe(1);
        expect(countWithoutContentType({ contentTypes: { a: {}, B: { name: 'zzz' } }, contents }, [])).toBe(2);
        expect(countWithoutContentType({ contents }, [])).toBe(4);
    });

    it('refreshes the type and entry lists after a real import, and not after a preview', async () => {
        const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        const own = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
        const { result } = renderHook(() => useImportBundle(), { wrapper: own });
        const bundle = { version: 1, contentTypes: [], contents: [] };

        await result.current.mutateAsync({ bundle, dryRun: true });
        expect(invalidate).not.toHaveBeenCalled();

        await result.current.mutateAsync({ bundle, dryRun: false });
        expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([['schemas'], ['contents']]);
    });

    it('sends only the sections the file has', async () => {
        await run({ bundle: { version: 1, contentTypes: { post: { name: 'post' } } }, dryRun: false });
        await run({ bundle: { version: 1, contents: [{ contentType: 'post' }] }, dryRun: false });

        expect(Object.keys((postedBody(0).document as object)).sort()).toEqual(['contentTypes', 'version']);
        expect(Object.keys((postedBody(1).document as object)).sort()).toEqual(['contents', 'version']);
    });

    it('does not guess a count when the type list is not loaded', async () => {
        const report = await run({ bundle: { contentTypes: [], contents: [{ contentType: 'ghost' }] }, dryRun: true, knownTypes: null });

        expect(report.contentsWithoutContentType).toBe(0);
    });

    it('lists errors, refusals and conflicts on a plan as separate lines', async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: plan(
                [
                    section('contentTypes', [], { errors: ['post: a field is repeated'], conflicts: ['page: a field change is running'] }),
                    section('contents', [], { refusals: ["'#1': you may not write that type"] }),
                ],
                { errors: ['the document is odd'], refusals: ['manage_config is missing'] }
            ),
        });

        const report = await run({ bundle: { contentTypes: [], contents: [] }, dryRun: true });

        expect(report.problems).toEqual([
            'the document is odd',
            'manage_config is missing',
            'contentTypes: post: a field is repeated',
            'contentTypes: page: a field change is running',
            "contents: '#1': you may not write that type",
        ]);
    });

    it('shows a destructive change on a plan as a line the page cannot apply', async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: plan([section('contentTypes', [{ key: 'post', kind: 'destructive', summary: 'remove the field Body' }])]),
        });

        const report = await run({ bundle: { contentTypes: [], contents: [] }, dryRun: true });

        expect(report.contentTypesUpdated).toBe(1);
        expect(report.problems).toEqual(['contentTypes post: remove the field Body. This page does not apply destructive changes.']);
    });

    it.each([400, 403, 409])('turns a %i answer into an ImportRefused with each line', async (status) => {
        vi.mocked(api.post).mockRejectedValue(
            refused(status, plan([section('contents', [], { errors: ["'#0': bad"], refusals: ["'#1': no"] })], { errors: ['first'] }))
        );
        const { result } = renderHook(() => useImportBundle(), { wrapper });

        const error = await result.current
            .mutateAsync({ bundle: { contentTypes: [], contents: [] }, dryRun: false })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ImportRefused);
        expect((error as InstanceType<typeof ImportRefused>).lines).toEqual(['first', "contents: '#0': bad", "contents: '#1': no"]);
    });

    it('turns an apply refused only for a destructive change into a line', async () => {
        vi.mocked(api.post).mockRejectedValue(
            refused(409, plan([section('contentTypes', [{ key: 'post', kind: 'destructive', summary: 'remove the field Body' }])]))
        );
        const { result } = renderHook(() => useImportBundle(), { wrapper });

        const error = await result.current
            .mutateAsync({ bundle: { contentTypes: [], contents: [] }, dryRun: false })
            .catch((e: unknown) => e);

        expect((error as InstanceType<typeof ImportRefused>).lines).toEqual([
            'contentTypes post: remove the field Body. This page does not apply destructive changes.',
        ]);
    });

    it('rethrows a failure that is not a config answer', async () => {
        const failure = refused(500, 'boom');
        vi.mocked(api.post).mockRejectedValue(failure);
        const { result } = renderHook(() => useImportBundle(), { wrapper });

        await expect(
            result.current.mutateAsync({ bundle: { contentTypes: [], contents: [] }, dryRun: true })
        ).rejects.toBe(failure);
    });
});

describe('helpers', () => {
    it('reads the gaps of every section as lines', () => {
        expect(gapLines({ gaps: { contents: ['one', 'two'], contentTypes: ['three'] } })).toEqual(['one', 'two', 'three']);
        expect(gapLines({})).toEqual([]);
    });

    it('reads a section as a list whichever shape it is in', () => {
        expect(sectionValues([1, 2])).toEqual([1, 2]);
        expect(sectionValues({ a: 1, b: 2 })).toEqual([1, 2]);
    });

    it('gives no lines for an answer that is clean', () => {
        const clean = plan([section('contentTypes', [{ key: 'a', kind: 'create' }])]);
        expect(linesOf(clean as Parameters<typeof linesOf>[0])).toEqual([]);
    });
});
