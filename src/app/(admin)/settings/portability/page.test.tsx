import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ContentTypeDefinition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { accessFrom } = await import('@/lib/access');
let access = accessFrom({ userId: 'u', username: 'u', tenant: 't', roles: [], capabilities: ['*'] }, []);
vi.mock('@/hooks/use-access', () => ({ useAccess: () => access }));

let types: ContentTypeDefinition[] | undefined = [];
let typesLoading = false;
vi.mock('@/hooks/use-schemas', () => ({ useSchemas: () => ({ data: types, isLoading: typesLoading }) }));

const { api } = await import('@/lib/api');
const { toast } = await import('sonner');
const { AxiosError, AxiosHeaders } = await import('axios');
const { __resetContractForTests, recordContractVersion } = await import('@/lib/api-contract');
const { default: PortabilityPage } = await import('./page');

function holding(...capabilities: string[]) {
    return accessFrom({ userId: 'u', username: 'u', tenant: 't', roles: [], capabilities }, []);
}

function type(name: string) {
    return { name, displayName: name, fields: [] } as ContentTypeDefinition;
}

function answer(sections: unknown[], extra: Record<string, unknown> = {}) {
    return { applied: false, errors: [], refusals: [], sections, ...extra };
}

function section(name: string, changes: { key: string; kind: string }[], extra: Record<string, unknown> = {}) {
    return { section: name, changes, errors: [], refusals: [], conflicts: [], ...extra };
}

function renderPage() {
    return render(
        React.createElement(
            QueryClientProvider,
            { client: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) },
            React.createElement(PortabilityPage)
        )
    );
}

function choose(body: unknown, name = 'bundle.json') {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    fireEvent.change(screen.getByLabelText('Choose a bundle file'), {
        target: { files: [new File([text], name, { type: 'application/json' })] },
    });
}

const OLD_FILE = {
    contentTypes: [{ name: 'post' }, { name: 'page' }],
    contents: [
        { contentType: 'post', data: {}, status: 'Draft' },
        { contentType: 'post', data: {}, status: 'Draft' },
        { contentType: 'ghost', data: {}, status: 'Draft' },
    ],
};

const PLAN = answer([
    section('contentTypes', [
        { key: 'post', kind: 'create' },
        { key: 'page', kind: 'change' },
    ]),
    section('contents', [
        { key: '#0', kind: 'create' },
        { key: '#1', kind: 'create' },
        { key: '#2', kind: 'create' },
    ]),
]);

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    __resetContractForTests();
    recordContractVersion('8');
    access = holding('*');
    types = [type('Post')];
    typesLoading = false;
});

describe('previewing and importing on the config routes', () => {
    it('shows the report from a plan, with the entries without a content type counted in the browser', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: PLAN });
        renderPage();

        choose(OLD_FILE);
        expect(await screen.findByText('2 content types and 3 entries in this file.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        expect(await screen.findByText('This is what an import would do')).toBeInTheDocument();
        expect(vi.mocked(api.post).mock.calls[0][0]).toBe('/api/config/plan');
        expect(screen.getByText('Content types created').nextSibling).toHaveTextContent('1');
        expect(screen.getByText('Content types updated').nextSibling).toHaveTextContent('1');
        expect(screen.getByText('Entries created').nextSibling).toHaveTextContent('3');
        // Only 'ghost' is in neither the file nor the type list. 'post' is in both.
        expect(screen.getByText(/1 entries name a content type that is in neither/)).toBeInTheDocument();
    });

    it('applies on Import with no destructive flag, and says it imported', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { ...PLAN, applied: true } });
        renderPage();

        choose({ version: 1, contentTypes: { post: { name: 'post' } }, contents: { 'id-1': { contentType: 'post', data: {}, status: 'Draft' } } });
        expect(await screen.findByText('1 content types and 1 entries in this file.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Import' }));

        expect(await screen.findByText('Imported')).toBeInTheDocument();
        expect(vi.mocked(api.post).mock.calls[0][0]).toBe('/api/config/apply');
        expect(JSON.stringify(vi.mocked(api.post).mock.calls[0][1])).not.toContain('allowDestructive');
        expect(toast.success).toHaveBeenCalledWith('Import finished.');
    });

    it('shows each error, refusal and conflict from a plan as its own line', async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: answer([
                section('contentTypes', [], { conflicts: ['post: a field change is running'] }),
                section('contents', [], { errors: ["'#1': that entry is not valid"], refusals: ["'#2': you may not write that type"] }),
            ]),
        });
        renderPage();

        choose(OLD_FILE);
        fireEvent.click(await screen.findByRole('button', { name: 'Preview' }));

        expect(await screen.findByText('contentTypes: post: a field change is running')).toBeInTheDocument();
        expect(screen.getByText("contents: '#1': that entry is not valid")).toBeInTheDocument();
        expect(screen.getByText("contents: '#2': you may not write that type")).toBeInTheDocument();
    });

    it('lists the lines of a refused apply under the buttons and toasts the first', async () => {
        vi.mocked(api.post).mockRejectedValue(
            new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
                status: 403,
                statusText: '',
                data: answer([], { refusals: ['Missing capability manage_content_types.', 'Missing capability import_content.'] }),
                headers: {},
                config: { headers: new AxiosHeaders() },
            })
        );
        renderPage();

        choose(OLD_FILE);
        fireEvent.click(await screen.findByRole('button', { name: 'Import' }));

        expect(await screen.findByText('Missing capability manage_content_types.')).toBeInTheDocument();
        expect(screen.getByText('Missing capability import_content.')).toBeInTheDocument();
        expect(toast.error).toHaveBeenCalledWith('Missing capability manage_content_types. (1 more below)');
        expect(screen.queryByText('Imported')).not.toBeInTheDocument();
    });

    it('waits for the content type list before it offers Preview and Import', async () => {
        typesLoading = true;
        renderPage();

        choose(OLD_FILE);

        expect(await screen.findByRole('button', { name: 'Preview' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    });

    it('still refuses a file that is not a bundle without asking the server', async () => {
        renderPage();

        choose({ hello: 'world' });

        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(vi.mocked(toast.error).mock.calls[0][0]).toContain('not a bundle this can import');
        expect(api.post).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    });
});

describe('exporting on the config routes', () => {
    it('downloads the config document as answered and says how much it holds', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { version: 1, withheld: [], contentTypes: { post: { name: 'post' } }, contents: { a: {}, b: {} } },
        });
        globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
        globalThis.URL.revokeObjectURL = vi.fn();
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Download bundle' }));

        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Exported 1 content types and 2 entries.'));
        expect(api.get).toHaveBeenCalledWith('/api/config/export', { params: { sections: 'contentTypes,contents' } });
    });

    it('names a section the caller may not read', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { version: 1, withheld: ['contents'], contentTypes: { post: { name: 'post' } } } });
        globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
        globalThis.URL.revokeObjectURL = vi.fn();
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Download bundle' }));

        await waitFor(() =>
            expect(toast.success).toHaveBeenCalledWith(
                'Exported 1 content types and 0 entries. Left out, because your role may not read them: contents.'
            )
        );
    });
});

describe('who is offered the buttons', () => {
    it('offers both to a caller holding manage_config and import_content', () => {
        access = holding('manage_config', 'import_content', 'export_content');
        renderPage();

        expect(screen.getByRole('button', { name: 'Download bundle' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Choose a file' })).toBeEnabled();
        expect(screen.queryByText(/which your role does not have/)).not.toBeInTheDocument();
    });

    it('disables both, with a reason each, for a caller without manage_config', () => {
        access = holding('export_content', 'import_content');
        renderPage();

        expect(screen.getByRole('button', { name: 'Download bundle' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Choose a file' })).toBeDisabled();
        expect(screen.getByText('Exporting needs the manage_config capability, which your role does not have.')).toBeInTheDocument();
        expect(screen.getByText('Importing needs the manage_config capability, which your role does not have.')).toBeInTheDocument();
    });

    it('disables only import for a caller without import_content', () => {
        access = holding('manage_config', 'export_content');
        renderPage();

        expect(screen.getByRole('button', { name: 'Download bundle' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Choose a file' })).toBeDisabled();
        expect(screen.getByText('Importing needs the import_content capability, which your role does not have.')).toBeInTheDocument();
    });

    it('adds no new limits on a core without the config routes', () => {
        __resetContractForTests();
        recordContractVersion('4');
        access = holding('export_content');
        renderPage();

        expect(screen.getByRole('button', { name: 'Download bundle' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Choose a file' })).toBeEnabled();
    });
});

describe('on a core without the config routes', () => {
    it('imports through the portability route and shows the server report as it always did', async () => {
        __resetContractForTests();
        recordContractVersion('4');
        vi.mocked(api.post).mockResolvedValue({
            data: { dryRun: true, contentTypesCreated: 2, contentTypesUpdated: 1, contentsCreated: 34, contentsWithoutContentType: 3 },
        });
        renderPage();

        choose(OLD_FILE);
        fireEvent.click(await screen.findByRole('button', { name: 'Preview' }));

        expect(await screen.findByText('This is what an import would do')).toBeInTheDocument();
        expect(vi.mocked(api.post).mock.calls[0][0]).toBe('/api/portability/import');
        expect(screen.getByText('Entries created').nextSibling).toHaveTextContent('34');
        expect(screen.getByText(/3 entries name a content type that is in neither/)).toBeInTheDocument();
    });
});
