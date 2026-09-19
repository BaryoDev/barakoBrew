import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { FieldDefinition } from '@/types/schema';

/**
 * The block editor against a site that publishes bindings, presets and layers.
 *
 * Driven through the real DynamicForm, with the site's schema on a stubbed fetch and the tenant's
 * content types and settings on a stubbed API client. The assertions are on what reaches `onChange`
 * and on what is sent to the API, because those are what a save writes.
 *
 * The last block here is the one that matters most: the same editor against a site that publishes
 * version 1 and no bindings at all, which has to work exactly as it did before any of this.
 */

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { DynamicForm } = await import('./dynamic-form');

const SITE_ID = '2a5e0b6c-1d3f-4a7b-8c9d-0e1f2a3b4c5d';

const V2 = {
    version: 2,
    bindings: {
        scopes: ['site', 'page', 'item', 'query', 'props'],
        formats: ['text', 'date', 'money', 'upper'],
    },
    blocks: [
        {
            type: 'text',
            label: 'Text',
            layer: 'primitive',
            perViewer: false,
            fields: [
                { name: 'value', kind: 'text', label: 'Words', required: true, bindable: true },
                { name: 'variant', kind: 'select', label: 'Style', options: ['meta', 'title'], bindable: true },
            ],
        },
        {
            type: 'source',
            label: 'Load content',
            layer: 'data',
            perViewer: false,
            fields: [
                { name: 'collection', kind: 'select', label: 'Collection', options: ['class'], bindable: true },
                { name: 'filterValue', kind: 'text', label: 'Holds the value', bindable: true },
                { name: 'content', kind: 'slots', label: 'Content', required: true, min: 1, max: 1 },
            ],
        },
    ],
};

const V1 = {
    version: 1,
    blocks: [
        {
            type: 'text',
            label: 'Text',
            perViewer: false,
            fields: [{ name: 'value', kind: 'text', label: 'Words', required: true }],
        },
    ],
};

const TYPE = (name: string, fields: string[], extra: Record<string, unknown> = {}) => ({
    name,
    displayName: name,
    fields: fields.map((f) => ({ name: f, displayName: f, type: 'string', isRequired: false })),
    ...extra,
});

const CONTENT_TYPES = [
    TYPE('site', ['Name', 'Presets'], { isSingleton: true }),
    TYPE('page', ['Title', 'Blocks']),
    TYPE('class', ['Teacher', 'Room']),
];

const FIELDS: FieldDefinition[] = [{ name: 'Blocks', displayName: 'Blocks', type: 'json', isRequired: false }];

let siteData: Record<string, unknown> = {};

function serveSchema(body: unknown) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
    );
}

function serveApi(types: unknown[] = CONTENT_TYPES) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types') {
            return { data: { items: types, totalItems: types.length, page: 1, pageSize: 50 } };
        }
        if (url === '/api/contents') {
            return { data: { items: [{ id: SITE_ID }], totalItems: 1, page: 1, pageSize: 2 } };
        }
        if (url === `/api/contents/${SITE_ID}`) {
            return {
                data: {
                    id: SITE_ID,
                    contentType: 'site',
                    data: siteData,
                    status: 'Published',
                    version: 3,
                },
                headers: { etag: '"3"' },
            };
        }
        throw new Error(`unexpected GET ${url}`);
    });
    vi.mocked(api.put).mockResolvedValue({ data: { id: SITE_ID, version: 4 } });
}

function renderBlocks(initial: unknown) {
    const saved: { current: unknown } = { current: initial };
    function Harness() {
        const [values, setValues] = useState<Record<string, unknown>>({ Blocks: initial });
        return (
            <DynamicForm
                contentType="page"
                fields={FIELDS}
                values={values}
                onChange={(next) => {
                    saved.current = next.Blocks;
                    setValues(next);
                }}
            />
        );
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <Harness />
        </QueryClientProvider>,
    );
    return saved;
}

/** Opens a block row by its label, and returns the panel a Use data button opens inside it. */
async function openPicker(block: RegExp, field: string) {
    fireEvent.click(await screen.findByRole('button', { name: block }));
    fireEvent.click(await screen.findByRole('button', { name: `Use data in ${field}` }));
    return screen.getByRole('group', { name: `Data for ${field}` });
}

beforeEach(() => {
    siteData = {};
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
    vi.stubEnv('NEXT_PUBLIC_PRESS_URL', 'https://site.example/');
    serveSchema(V2);
    serveApi();
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('picking a data binding', () => {
    it('offers the scopes the site published, and nothing this console made up', async () => {
        renderBlocks([{ type: 'text', props: { value: 'Welcome to ' } }]);
        const panel = await openPicker(/^Text/, 'Words');
        const scope = within(panel).getByLabelText('Where from') as HTMLSelectElement;
        expect([...scope.options].map((o) => o.value)).toEqual(V2.bindings.scopes);
    });

    it('builds a binding from a scope and a field, with nobody typing a brace', async () => {
        const saved = renderBlocks([{ type: 'text', props: { value: 'Welcome to ' } }]);
        const panel = await openPicker(/^Text/, 'Words');

        const fields = within(panel).getByLabelText('Which field') as HTMLSelectElement;
        await waitFor(() => expect([...fields.options].map((o) => o.value)).toContain('Name'));
        fireEvent.change(fields, { target: { value: 'Name' } });
        fireEvent.click(within(panel).getByRole('button', { name: 'Insert' }));

        expect(saved.current).toEqual([{ type: 'text', props: { value: 'Welcome to {{site.Name}}' } }]);
    });

    it('lists the tenant content type fields for a scope, not a list this console holds', async () => {
        renderBlocks([{ type: 'text', props: { value: '' } }]);
        const panel = await openPicker(/^Text/, 'Words');
        const fields = within(panel).getByLabelText('Which field') as HTMLSelectElement;
        await waitFor(() => expect([...fields.options].map((o) => o.value)).toContain('Name'));
        expect([...fields.options].map((o) => o.value)).toContain('Presets');
    });

    it('takes a typed name for the address, which carries whatever the page declares', async () => {
        const saved = renderBlocks([{ type: 'source', props: { collection: 'class' } }]);
        const panel = await openPicker(/^Load content/, 'Holds the value');

        fireEvent.change(within(panel).getByLabelText('Where from'), { target: { value: 'query' } });
        fireEvent.change(within(panel).getByLabelText('Which field'), { target: { value: 'class' } });
        fireEvent.click(within(panel).getByRole('button', { name: 'Insert' }));

        expect(saved.current).toEqual([{ type: 'source', props: { collection: 'class', filterValue: '{{query.class}}' } }]);
    });

    it('writes the format and the fallback the picker collected', async () => {
        const saved = renderBlocks([{ type: 'text', props: { value: '' } }]);
        const panel = await openPicker(/^Text/, 'Words');

        const fields = within(panel).getByLabelText('Which field') as HTMLSelectElement;
        await waitFor(() => expect([...fields.options].map((o) => o.value)).toContain('Name'));
        fireEvent.change(fields, { target: { value: 'Name' } });
        fireEvent.change(within(panel).getByLabelText('Shown as'), { target: { value: 'upper' } });
        fireEvent.change(within(panel).getByLabelText('Show this when there is nothing'), {
            target: { value: 'this site' },
        });
        fireEvent.click(within(panel).getByRole('button', { name: 'Insert' }));

        expect(saved.current).toEqual([{ type: 'text', props: { value: '{{site.Name | upper ?? this site}}' } }]);
    });

    it('refuses a fallback holding a brace, which would end the placeholder early', async () => {
        renderBlocks([{ type: 'text', props: { value: '' } }]);
        const panel = await openPicker(/^Text/, 'Words');
        const fields = within(panel).getByLabelText('Which field') as HTMLSelectElement;
        await waitFor(() => expect([...fields.options].map((o) => o.value)).toContain('Name'));
        fireEvent.change(fields, { target: { value: 'Name' } });
        fireEvent.change(within(panel).getByLabelText('Show this when there is nothing'), {
            target: { value: 'a } b' },
        });
        expect(within(panel).getByText(/cannot hold/)).toBeInTheDocument();
        expect(within(panel).getByRole('button', { name: 'Insert' })).toBeDisabled();
    });

    it('removes a binding from a prop without touching the words around it', async () => {
        const saved = renderBlocks([{ type: 'text', props: { value: 'Welcome to {{site.Name}}' } }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Text/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove {{site.Name}} from Words' }));
        expect(saved.current).toEqual([{ type: 'text', props: { value: 'Welcome to ' } }]);
    });

    it('offers the fields of whatever a data block loads, once inside it', async () => {
        renderBlocks([
            { type: 'source', props: { collection: 'class', content: [[{ type: 'text', props: { value: '' } }]] } },
        ]);
        fireEvent.click(await screen.findByRole('button', { name: /^Load content/ }));
        const panel = await openPicker(/^Text/, 'Words');

        fireEvent.change(within(panel).getByLabelText('Where from'), { target: { value: 'item' } });
        const fields = within(panel).getByLabelText('Which field') as HTMLSelectElement;
        await waitFor(() => expect([...fields.options].map((o) => o.value)).toContain('Teacher'));
        expect(within(panel).queryByText(/Only inside a block that loads/)).toBeNull();
    });

    it('says the item scope holds nothing outside a data block', async () => {
        renderBlocks([{ type: 'text', props: { value: '' } }]);
        const panel = await openPicker(/^Text/, 'Words');
        fireEvent.change(within(panel).getByLabelText('Where from'), { target: { value: 'item' } });
        expect(within(panel).getByText(/Only inside a block that loads/)).toBeInTheDocument();
    });

    it('does not mark a bound select as a value that is not an option, since it resolves to one', async () => {
        renderBlocks([{ type: 'text', props: { value: 'x', variant: '{{site.Name}}' } }]);
        await screen.findByRole('button', { name: /^Text/ });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        expect(screen.queryByText('1 problem')).toBeNull();
        expect(screen.queryByText(/data problem/)).toBeNull();
    });

    it('still marks a select holding text that is not a binding and not an option', async () => {
        renderBlocks([{ type: 'text', props: { value: 'x', variant: 'huge' } }]);
        expect(await screen.findByText('1 problem')).toBeInTheDocument();
    });
});

describe('a binding to a field the content type no longer has', () => {
    it('marks the block, and says what the page will show instead', async () => {
        renderBlocks([{ type: 'text', props: { value: 'Call {{site.Mobile ?? the office}}' } }]);
        expect(await screen.findByText('1 data problem')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Text/ }));
        expect(screen.getByText(/no field called "Mobile"/)).toHaveTextContent('the page shows "the office"');
    });

    it('marks every block holding it, not just the first', async () => {
        renderBlocks([
            { type: 'text', props: { value: '{{site.Mobile}}' } },
            { type: 'text', props: { value: '{{site.Mobile}}' } },
        ]);
        expect(await screen.findAllByText('1 data problem')).toHaveLength(2);
    });

    it('says nothing about a binding whose field is still there', async () => {
        renderBlocks([{ type: 'text', props: { value: '{{site.Name}}' } }]);
        await screen.findByRole('button', { name: /^Text/ });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        expect(screen.queryByText(/data problem/)).toBeNull();
    });
});

describe('the palette and the tenant saved blocks', () => {
    it('groups the blocks by the layer the site published', async () => {
        renderBlocks([]);
        fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }));
        const palette = screen.getByRole('group', { name: 'Blocks to add to Blocks' });
        expect(within(palette).getByText('Parts')).toBeInTheDocument();
        expect(within(palette).getByText('Content and conditions')).toBeInTheDocument();
    });

    it('offers a preset the tenant stored, and starts one when it is added', async () => {
        siteData = {
            Presets: [
                {
                    type: 'band',
                    label: 'Band',
                    fields: [{ name: 'heading', kind: 'text' }],
                    blocks: [{ type: 'text', props: { value: '{{props.heading}}' } }],
                },
            ],
        };
        const saved = renderBlocks([]);
        fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }));
        const palette = screen.getByRole('group', { name: 'Blocks to add to Blocks' });
        await waitFor(() => expect(within(palette).getByText('Saved blocks')).toBeInTheDocument());

        fireEvent.click(within(palette).getByRole('button', { name: 'Band' }));
        expect(saved.current).toEqual([{ type: 'band', props: {} }]);
        expect(screen.getByLabelText(/^heading/)).toBeInTheDocument();
    });

    it('saves a block into the Presets site setting, keeping the settings already there', async () => {
        siteData = { Name: 'Academy' };
        renderBlocks([{ type: 'text', props: { value: '{{props.heading}}' } }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Text/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Save as a reusable block' }));

        const panel = screen.getByRole('group', { name: 'Save as a reusable block' });
        fireEvent.change(within(panel).getByLabelText('Name'), { target: { value: 'band' } });
        fireEvent.change(within(panel).getByLabelText('What to call it in the palette'), { target: { value: 'Band' } });
        fireEvent.click(within(panel).getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(api.put).toHaveBeenCalled());
        const [url, body] = vi.mocked(api.put).mock.calls[0];
        expect(url).toBe(`/api/contents/${SITE_ID}`);
        expect((body as { data: Record<string, unknown> }).data.Name).toBe('Academy');
        expect((body as { data: { Presets: unknown[] } }).data.Presets).toEqual([
            {
                type: 'band',
                label: 'Band',
                fields: [{ name: 'heading', kind: 'text', label: 'heading' }],
                blocks: [{ type: 'text', props: { value: '{{props.heading}}' } }],
            },
        ]);
    });

    it('refuses a name a block that is code already has, since the site would ignore the preset', async () => {
        renderBlocks([{ type: 'text', props: { value: 'x' } }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Text/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Save as a reusable block' }));

        const panel = screen.getByRole('group', { name: 'Save as a reusable block' });
        fireEvent.change(within(panel).getByLabelText('Name'), { target: { value: 'text' } });
        expect(within(panel).getByText(/already has a block called text/)).toBeInTheDocument();
        expect(within(panel).getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('says why a block cannot be saved when the site type has no Presets field', async () => {
        serveApi([TYPE('site', ['Name'], { isSingleton: true }), TYPE('page', ['Title', 'Blocks'])]);
        renderBlocks([{ type: 'text', props: { value: 'x' } }]);
        fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }));
        const palette = screen.getByRole('group', { name: 'Blocks to add to Blocks' });
        await waitFor(() => expect(within(palette).getByText(/JSON field called Presets/)).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'Save as a reusable block' })).toBeNull();
    });
});

describe('the same editor against a site that publishes version 1', () => {
    beforeEach(() => serveSchema(V1));

    it('edits blocks as it always did, with no binding picker anywhere', async () => {
        const saved = renderBlocks([{ type: 'text', props: { value: 'Hello' } }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Text/ }));

        const words = screen.getByLabelText(/^Words/) as HTMLTextAreaElement;
        expect(words.value).toBe('Hello');
        fireEvent.change(words, { target: { value: 'Hello there' } });
        expect(saved.current).toEqual([{ type: 'text', props: { value: 'Hello there' } }]);

        expect(screen.queryByRole('button', { name: /^Use data/ })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Save as a reusable block' })).toBeNull();
    });

    it('asks the API for nothing the pickers would have needed', async () => {
        renderBlocks([{ type: 'text', props: { value: 'Hello' } }]);
        await screen.findByRole('button', { name: /^Text/ });
        expect(api.get).not.toHaveBeenCalled();
    });

    it('leaves a stored binding as the text the site will render, and marks nothing', async () => {
        const saved = renderBlocks([{ type: 'text', props: { value: '{{site.Name}}' } }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Text/ }));
        expect((screen.getByLabelText(/^Words/) as HTMLTextAreaElement).value).toBe('{{site.Name}}');
        expect(screen.queryByText(/data problem/)).toBeNull();
        expect(saved.current).toEqual([{ type: 'text', props: { value: '{{site.Name}}' } }]);
    });

    it('shows one palette with no layer headings, since every block is just a block', async () => {
        renderBlocks([]);
        fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }));
        const palette = screen.getByRole('group', { name: 'Blocks to add to Blocks' });
        expect(within(palette).getByRole('button', { name: 'Text' })).toBeInTheDocument();
        expect(within(palette).queryByText('Parts')).toBeNull();
    });
});
