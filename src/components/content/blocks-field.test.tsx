import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { DynamicForm } from './dynamic-form';
import type { FieldDefinition } from '@/types/schema';

/**
 * The Blocks field of a page, driven through the real DynamicForm with the site's schema served by a
 * stubbed fetch. What reaches `onChange` is what the entry editor saves, so the assertions are on
 * that value rather than on what the screen happens to show.
 */

const SCHEMA = {
    version: 1,
    blocks: [
        {
            type: 'richText',
            label: 'Rich text',
            perViewer: false,
            fields: [{ name: 'markdown', kind: 'markdown', label: 'Text', required: true }],
        },
        {
            type: 'image',
            label: 'Image',
            perViewer: false,
            fields: [
                { name: 'src', kind: 'url', label: 'Image URL', required: true },
                { name: 'alt', kind: 'text', label: 'Alternative text' },
            ],
        },
        {
            type: 'columns',
            label: 'Columns',
            perViewer: false,
            fields: [{ name: 'columns', kind: 'slots', label: 'Columns', required: true, min: 1, max: 4 }],
        },
        {
            type: 'callToAction',
            label: 'Call to action',
            perViewer: false,
            fields: [
                { name: 'heading', kind: 'text', label: 'Heading', required: true },
                { name: 'label', kind: 'text', label: 'Button label', required: true },
                { name: 'href', kind: 'url', label: 'Button link', required: true },
            ],
        },
        {
            type: 'collection',
            label: 'Collection',
            perViewer: false,
            fields: [{ name: 'collection', kind: 'select', label: 'Collection', required: true, options: ['post', 'author'] }],
        },
    ],
};

const FIELDS: FieldDefinition[] = [{ name: 'Blocks', displayName: 'Blocks', type: 'json', isRequired: false }];

let fetchMock: ReturnType<typeof vi.fn>;

function serve(response: { ok: boolean; status: number; body?: unknown }) {
    fetchMock = vi.fn(async () => ({ ok: response.ok, status: response.status, json: async () => response.body }));
    vi.stubGlobal('fetch', fetchMock);
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
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <Harness />
        </QueryClientProvider>,
    );
    return saved;
}

beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_PRESS_URL', 'https://site.example/');
    serve({ ok: true, status: 200, body: SCHEMA });
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('a page with a reachable block schema', () => {
    it('reads the schema from the site, without the session', async () => {
        renderBlocks([]);
        await screen.findByText('No blocks yet.');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://site.example/api/blocks');
        expect(init).toMatchObject({ credentials: 'omit' });
        expect(init.headers).not.toHaveProperty('Authorization');
    });

    it('builds a form for a block from its fields, and saves an edit into its props', async () => {
        const saved = renderBlocks([
            { type: 'callToAction', props: { heading: 'Talk to us', label: 'Contact', href: '/contact' } },
        ]);
        fireEvent.click(await screen.findByRole('button', { name: /^Call to action/ }));

        const heading = screen.getByLabelText(/^Heading/) as HTMLTextAreaElement;
        expect(heading.value).toBe('Talk to us');
        expect((screen.getByLabelText(/^Button link/) as HTMLInputElement).type).toBe('url');

        fireEvent.change(heading, { target: { value: 'Visit us' } });
        expect(saved.current).toEqual([
            { type: 'callToAction', props: { heading: 'Visit us', label: 'Contact', href: '/contact' } },
        ]);
    });

    it('gives a select field its options', async () => {
        const saved = renderBlocks([{ type: 'collection', props: {} }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Collection/ }));
        const select = screen.getByLabelText(/^Collection/) as HTMLSelectElement;
        expect([...select.options].map((o) => o.value)).toEqual(['', 'post', 'author']);
        fireEvent.change(select, { target: { value: 'author' } });
        expect(saved.current).toEqual([{ type: 'collection', props: { collection: 'author' } }]);
    });

    it('adds a block from the palette the schema builds', async () => {
        const saved = renderBlocks([{ type: 'richText', props: { markdown: 'Hello' } }]);
        fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }));
        const palette = screen.getByRole('group', { name: 'Blocks to add to Blocks' });
        expect(within(palette).getAllByRole('button')).toHaveLength(5);
        fireEvent.click(within(palette).getByRole('button', { name: 'Columns' }));

        expect(saved.current).toEqual([
            { type: 'richText', props: { markdown: 'Hello' } },
            { type: 'columns', props: { columns: [[]] } },
        ]);
        expect(screen.getByRole('button', { name: /^Columns/, expanded: true })).toHaveFocus();
    });

    it('reorders from the keyboard, and says where the block went', async () => {
        const saved = renderBlocks([
            { type: 'richText', props: { markdown: 'First' } },
            { type: 'image', props: { src: '/second.png' } },
            { type: 'image', props: { src: '/third.png', alt: 'Third' } },
        ]);
        const up = await screen.findByRole('button', { name: 'Move Image, block 3 up' });
        expect(screen.getByRole('button', { name: 'Move Rich text, block 1 up' })).toBeDisabled();

        fireEvent.click(up);
        expect(saved.current).toEqual([
            { type: 'richText', props: { markdown: 'First' } },
            { type: 'image', props: { src: '/third.png', alt: 'Third' } },
            { type: 'image', props: { src: '/second.png' } },
        ]);
        expect(screen.getByText('Image moved to position 2 of 3')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Move Image, block 2 up' })).toHaveFocus());

        fireEvent.click(screen.getByRole('button', { name: 'Move Rich text, block 1 down' }));
        expect((saved.current as { type: string }[]).map((b) => b.type)).toEqual(['image', 'richText', 'image']);
    });

    it('removes a block', async () => {
        const saved = renderBlocks([
            { type: 'richText', props: { markdown: 'Keep' } },
            { type: 'image', props: { src: '/drop.png' } },
        ]);
        fireEvent.click(await screen.findByRole('button', { name: 'Remove Image, block 2' }));
        expect(saved.current).toEqual([{ type: 'richText', props: { markdown: 'Keep' } }]);
    });

    it('shows a block of an unknown type read-only, and keeps it and its neighbours whole on save', async () => {
        const unknown = { type: 'pricing', id: 'plan-pro', props: { plan: 'Pro', price: 499 } };
        const saved = renderBlocks([
            unknown,
            { type: 'image', props: { src: '/a.png', focalPoint: [0.5, 0.5] } },
        ]);

        fireEvent.click(await screen.findByRole('button', { name: /^Unknown block/ }));
        expect(screen.getByText(/no block called "pricing"/)).toBeInTheDocument();
        expect(screen.getByText(/"price": 499/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Image/ }));
        fireEvent.change(screen.getByLabelText(/^Alternative text/), { target: { value: 'A harbour' } });
        fireEvent.click(screen.getByRole('button', { name: 'Move Image, block 2 up' }));

        const blocks = saved.current as unknown[];
        expect(blocks).toHaveLength(2);
        expect(blocks[1]).toBe(unknown);
        expect(blocks[0]).toEqual({ type: 'image', props: { src: '/a.png', focalPoint: [0.5, 0.5], alt: 'A harbour' } });
        expect(screen.getByText(/Also holds focalPoint/)).toBeInTheDocument();
    });

    it('shows what the site would refuse, on the row and on the field', async () => {
        renderBlocks([{ type: 'callToAction', props: { heading: 'Hi', href: 'javascript:alert(1)' } }]);
        expect(await screen.findByText('2 problems')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /^Call to action/ }));
        expect(screen.getByText(/Has to be a link starting with/)).toBeInTheDocument();
        expect(screen.getByText('Required. The site does not show this block without it.')).toBeInTheDocument();
    });

    it('edits blocks nested in a slots field, and adds a list up to its maximum', async () => {
        const saved = renderBlocks([
            {
                type: 'columns',
                props: { columns: [[{ type: 'image', props: { src: '/left.png' } }], [{ type: 'richText', props: { markdown: 'Right' } }]] },
            },
        ]);
        fireEvent.click(await screen.findByRole('button', { name: /^Columns/ }));

        const first = screen.getByRole('region', { name: 'Columns 1' });
        fireEvent.click(within(first).getByRole('button', { name: 'Add a block to Columns 1' }));
        fireEvent.click(within(first).getByRole('button', { name: 'Call to action' }));

        const second = screen.getByRole('region', { name: 'Columns 2' });
        fireEvent.click(within(second).getByRole('button', { name: 'Remove Rich text, block 1' }));

        expect(saved.current).toEqual([
            {
                type: 'columns',
                props: {
                    columns: [
                        [{ type: 'image', props: { src: '/left.png' } }, { type: 'callToAction', props: {} }],
                        [],
                    ],
                },
            },
        ]);

        const addList = screen.getByRole('button', { name: 'Add to Columns' });
        fireEvent.click(addList);
        fireEvent.click(addList);
        expect(((saved.current as { props: { columns: unknown[] } }[])[0].props.columns)).toHaveLength(4);
        expect(addList).toBeDisabled();
    });
});

describe('a page without a block schema', () => {
    it('falls back to the JSON editor when no site address is set, and asks for nothing', async () => {
        vi.stubEnv('NEXT_PUBLIC_PRESS_URL', '');
        const value = [{ type: 'richText', props: { markdown: 'Hi' } }];
        renderBlocks(value);
        expect(screen.getByText(/No site address is set/)).toBeInTheDocument();
        const textarea = document.getElementById('Blocks') as HTMLTextAreaElement;
        expect(JSON.parse(textarea.value)).toEqual(value);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps the JSON editor while the schema is still being read, and gives the read a timeout', async () => {
        fetchMock = vi.fn(() => new Promise(() => {}));
        vi.stubGlobal('fetch', fetchMock);
        const value = [{ type: 'richText', props: { markdown: 'Hi' } }];
        renderBlocks(value);

        expect(screen.getByText(/Reading the blocks/)).toBeInTheDocument();
        const textarea = document.getElementById('Blocks') as HTMLTextAreaElement;
        expect(textarea.tagName).toBe('TEXTAREA');
        expect(JSON.parse(textarea.value)).toEqual(value);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });

    it('falls back to the JSON editor when the schema cannot be read', async () => {
        serve({ ok: false, status: 404 });
        const value = [{ type: 'pricing', props: { plan: 'Pro' } }];
        renderBlocks(value);
        expect(await screen.findByText(/could not be read/)).toBeInTheDocument();
        expect(JSON.parse((document.getElementById('Blocks') as HTMLTextAreaElement).value)).toEqual(value);
    });

    it('falls back when the site publishes a schema version this console does not read', async () => {
        serve({ ok: true, status: 200, body: { ...SCHEMA, version: 2 } });
        renderBlocks([]);
        expect(await screen.findByText(/could not be read/)).toBeInTheDocument();
        expect(document.getElementById('Blocks')?.tagName).toBe('TEXTAREA');
    });

    it('shows a stored value that is not a list as JSON, even with a schema', async () => {
        renderBlocks({ type: 'richText' });
        expect(await screen.findByText('This value is not a list of blocks, so it is shown as JSON.')).toBeInTheDocument();
        expect(document.getElementById('Blocks')?.tagName).toBe('TEXTAREA');
    });
});

describe('a json field with another name', () => {
    it('keeps the JSON editor and never asks the site', () => {
        render(
            <DynamicForm
                fields={[{ name: 'Settings', displayName: 'Settings', type: 'json', isRequired: false }]}
                values={{ Settings: {} }}
                onChange={() => {}}
            />,
        );
        expect(document.getElementById('Settings')?.tagName).toBe('TEXTAREA');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
