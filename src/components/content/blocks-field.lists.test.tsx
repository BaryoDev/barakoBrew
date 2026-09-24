import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { FieldDefinition } from '@/types/schema';

/**
 * List and group block fields, driven through the real DynamicForm with the site's schema on a
 * stubbed fetch. The schema is the one barakoPress publishes for a block with a list of groups, a
 * list of text, a list of numbers and a group, so what reaches `onChange` is what a save writes.
 */

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { DynamicForm } = await import('./dynamic-form');

const PATH_BLOCK = {
    type: 'path',
    label: 'Path',
    layer: 'block',
    perViewer: false,
    fields: [
        { name: 'heading', kind: 'text', label: 'Heading', bindable: true },
        {
            name: 'stages',
            kind: 'list',
            label: 'Stages',
            required: true,
            min: 2,
            max: 5,
            bindable: true,
            item: {
                kind: 'group',
                label: 'Stage',
                bindable: true,
                fields: [
                    { name: 'label', kind: 'text', label: 'Label', required: true, bindable: true },
                    { name: 'href', kind: 'url', label: 'Link', bindable: true },
                    {
                        name: 'links',
                        kind: 'list',
                        label: 'Links',
                        max: 3,
                        bindable: true,
                        item: { kind: 'url', label: 'Link address', bindable: true },
                    },
                ],
            },
        },
        { name: 'tags', kind: 'list', label: 'Tags', max: 3, bindable: true, item: { kind: 'text', label: 'Tag', bindable: true } },
        { name: 'scores', kind: 'list', label: 'Scores', bindable: true, item: { kind: 'number', min: 0, max: 10, bindable: false } },
        {
            name: 'lead',
            kind: 'group',
            label: 'Lead',
            bindable: true,
            fields: [
                { name: 'label', kind: 'text', label: 'Lead label', required: true, bindable: true },
                { name: 'href', kind: 'url', label: 'Lead link', bindable: true },
            ],
        },
        { name: 'swatches', kind: 'list', label: 'Swatches', bindable: true, item: { kind: 'colour', bindable: true } },
    ],
};

const V2 = { version: 2, bindings: { scopes: ['site', 'page', 'item'], formats: ['text'] }, blocks: [PATH_BLOCK] };
const V1 = { version: 1, blocks: [PATH_BLOCK] };

const CONTENT_TYPES = [
    {
        name: 'site',
        displayName: 'site',
        isSingleton: true,
        fields: [{ name: 'Name', displayName: 'Name', type: 'string', isRequired: false }],
    },
    { name: 'page', displayName: 'page', fields: [{ name: 'Blocks', displayName: 'Blocks', type: 'json', isRequired: false }] },
];

const FIELDS: FieldDefinition[] = [{ name: 'Blocks', displayName: 'Blocks', type: 'json', isRequired: false }];

const FOUR = ['Plan', 'Build', 'Test', 'Run'].map((label) => ({ label }));

function serveSchema(body: unknown) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
    );
}

function renderBlocks(props: Record<string, unknown>) {
    const initial = [{ type: 'path', props }];
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
    return {
        props: () => (saved.current as { props: Record<string, unknown> }[])[0].props,
    };
}

async function openBlock() {
    fireEvent.click(await screen.findByRole('button', { name: /^Path/ }));
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types') {
            return { data: { items: CONTENT_TYPES, totalItems: CONTENT_TYPES.length, page: 1, pageSize: 50 } };
        }
        if (url === '/api/contents') return { data: { items: [], totalItems: 0, page: 1, pageSize: 2 } };
        throw new Error(`unexpected GET ${url}`);
    });
    vi.stubEnv('NEXT_PUBLIC_PRESS_URL', 'https://site.example/');
    serveSchema(V2);
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('a list of groups', () => {
    it('draws each entry as a collapsible row, and adds a fifth stage', async () => {
        const saved = renderBlocks({ stages: FOUR });
        await openBlock();

        const list = screen.getByRole('list', { name: 'Stages' });
        const rows = within(list).getAllByRole('button', { name: /^Stage \d/, expanded: false });
        expect(rows).toHaveLength(4);
        expect(rows[1]).toHaveTextContent('Build');

        fireEvent.click(screen.getByRole('button', { name: 'Add to Stages' }));
        const fifth = screen.getByRole('button', { name: /^Stage 5/, expanded: true });
        expect(fifth).toHaveFocus();

        const body = document.getElementById(fifth.getAttribute('aria-controls')!)!;
        fireEvent.change(within(body).getByLabelText(/^Label/), { target: { value: 'Ship' } });

        expect(saved.props().stages).toEqual([...FOUR, { label: 'Ship' }]);
        expect(screen.getByRole('button', { name: 'Add to Stages' })).toBeDisabled();
    });

    it('reorders from the keyboard, keeps focus on the moved entry and says where it went', async () => {
        const saved = renderBlocks({ stages: FOUR });
        await openBlock();

        expect(screen.getByRole('button', { name: 'Move Stage 1 up' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Move Stage 3 up' }));

        expect(saved.props().stages).toEqual([FOUR[0], FOUR[2], FOUR[1], FOUR[3]]);
        expect(screen.getByText('Stage moved to position 2 of 4')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Move Stage 2 up' })).toHaveFocus());

        fireEvent.click(screen.getByRole('button', { name: 'Move Stage 4 up' }));
        expect((saved.props().stages as { label: string }[]).map((s) => s.label)).toEqual(['Plan', 'Test', 'Run', 'Build']);
    });

    it('keeps an open entry open when it moves', async () => {
        renderBlocks({ stages: FOUR });
        await openBlock();
        fireEvent.click(screen.getByRole('button', { name: /^Stage 1/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Move Stage 1 down' }));
        expect(screen.getByRole('button', { name: /^Stage 2/ })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('button', { name: /^Stage 1/ })).toHaveAttribute('aria-expanded', 'false');
    });

    it('removes an entry, and not below the minimum', async () => {
        const saved = renderBlocks({ stages: FOUR.slice(0, 3) });
        await openBlock();

        fireEvent.click(screen.getByRole('button', { name: 'Remove Stage 2' }));
        expect(saved.props().stages).toEqual([FOUR[0], FOUR[2]]);
        expect(screen.getByRole('button', { name: 'Remove Stage 1' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Remove Stage 2' })).toBeDisabled();
    });

    it('marks a missing required part on the entry and on the block', async () => {
        renderBlocks({ stages: [{ label: 'Plan' }, { href: '/build' }] });
        const block = await screen.findByRole('button', { name: /^Path/ });
        expect(within(block.parentElement!).getByText('1 problem')).toBeInTheDocument();
        fireEvent.click(block);

        const second = screen.getByRole('button', { name: /^Stage 2/ });
        expect(within(second.parentElement!).getByText('1 problem')).toBeInTheDocument();
        fireEvent.click(second);
        const body = document.getElementById(second.getAttribute('aria-controls')!)!;
        expect(within(body).getByText('Required. The site does not show this block without it.')).toBeInTheDocument();
    });

    it('edits a list nested inside an entry', async () => {
        const saved = renderBlocks({ stages: [{ label: 'Plan', links: ['/a'] }, { label: 'Build' }] });
        await openBlock();
        fireEvent.click(screen.getByRole('button', { name: /^Stage 1/ }));

        const links = screen.getByRole('group', { name: 'Links' });
        fireEvent.click(within(links).getByRole('button', { name: 'Add to Links' }));
        fireEvent.change(within(links).getByLabelText(/^Link address 2/), { target: { value: '/b' } });

        expect(saved.props().stages).toEqual([{ label: 'Plan', links: ['/a', '/b'] }, { label: 'Build' }]);
    });

    it('offers the binding picker on a text box inside an entry', async () => {
        const saved = renderBlocks({ stages: [{ label: 'Welcome to ' }, { label: 'Build' }] });
        await openBlock();
        const first = screen.getByRole('button', { name: /^Stage 1/ });
        fireEvent.click(first);
        const body = document.getElementById(first.getAttribute('aria-controls')!)!;

        fireEvent.click(within(body).getByRole('button', { name: 'Use data in Label' }));
        const panel = within(body).getByRole('group', { name: 'Data for Label' });
        const fields = within(panel).getByLabelText('Which field') as HTMLSelectElement;
        await waitFor(() => expect([...fields.options].map((o) => o.value)).toContain('Name'));
        fireEvent.change(fields, { target: { value: 'Name' } });
        fireEvent.click(within(panel).getByRole('button', { name: 'Insert' }));

        expect(saved.props().stages).toEqual([{ label: 'Welcome to {{site.Name}}' }, { label: 'Build' }]);
    });
});

describe('a list of values', () => {
    it('edits a list of text as one labelled box per entry, up to its maximum', async () => {
        const saved = renderBlocks({ stages: FOUR, tags: ['news'] });
        await openBlock();

        const tags = screen.getByRole('group', { name: 'Tags' });
        fireEvent.click(within(tags).getByRole('button', { name: 'Add to Tags' }));
        expect(within(tags).getByLabelText(/^Tag 2/)).toHaveFocus();
        fireEvent.change(within(tags).getByLabelText(/^Tag 2/), { target: { value: 'events' } });
        expect(saved.props().tags).toEqual(['news', 'events']);

        fireEvent.click(within(tags).getByRole('button', { name: 'Add to Tags' }));
        expect(saved.props().tags).toEqual(['news', 'events', '']);
        expect(within(tags).getByRole('button', { name: 'Add to Tags' })).toBeDisabled();

        fireEvent.click(within(tags).getByRole('button', { name: 'Move Tag 2 up' }));
        expect(saved.props().tags).toEqual(['events', 'news', '']);
    });

    it('checks each number against the item range', async () => {
        renderBlocks({ stages: FOUR, scores: [4, 11] });
        expect(await screen.findByText('1 problem')).toBeInTheDocument();
        await openBlock();
        const scores = screen.getByRole('group', { name: 'Scores' });
        expect(within(scores).getByText('Has to be a number from 0 to 10.')).toBeInTheDocument();
        expect(within(scores).getAllByText(/Has to be a number/)).toHaveLength(1);
    });

    it('says when a list is shorter than its minimum', async () => {
        renderBlocks({ stages: [{ label: 'Plan' }] });
        await openBlock();
        const stages = screen.getByRole('group', { name: /^Stages/ });
        expect(within(stages).getByText('Has to hold from 2 to 5 entries.')).toBeInTheDocument();
    });

    it('edits an item kind this console does not know as JSON, keeping what it holds', async () => {
        renderBlocks({ stages: FOUR, swatches: [{ r: 1 }] });
        await openBlock();
        const box = screen.getByLabelText(/^Swatches/) as HTMLTextAreaElement;
        expect(box.tagName).toBe('TEXTAREA');
        expect(JSON.parse(box.value)).toEqual([{ r: 1 }]);
    });

    it('keeps a whole list bound to data, and lets an editor replace it with entries', async () => {
        const saved = renderBlocks({ stages: '{{item.Stages}}' });
        await openBlock();
        const stages = screen.getByRole('group', { name: /^Stages/ });
        expect(within(stages).getByText('{{item.Stages}}')).toBeInTheDocument();
        expect(screen.queryByText(/^\d+ problems?$/)).toBeNull();

        fireEvent.click(within(stages).getByRole('button', { name: 'Use entries instead' }));
        expect(saved.props().stages).toBeUndefined();
        expect(within(stages).getByRole('button', { name: 'Add to Stages' })).toBeEnabled();
    });
});

describe('a group', () => {
    it('edits a group as a sub-form, and keeps keys it does not declare', async () => {
        const saved = renderBlocks({ stages: FOUR, lead: { label: 'Talk to us', note: 'kept' } });
        await openBlock();
        const lead = screen.getByRole('group', { name: 'Lead' });
        expect((within(lead).getByLabelText(/^Lead label/) as HTMLInputElement).value).toBe('Talk to us');

        fireEvent.change(within(lead).getByLabelText(/^Lead link/), { target: { value: '/contact' } });
        expect(saved.props().lead).toEqual({ label: 'Talk to us', note: 'kept', href: '/contact' });
    });

    it('shows a wrong link inside a group on the field that holds it', async () => {
        renderBlocks({ stages: FOUR, lead: { label: 'Go', href: 'javascript:alert(1)' } });
        expect(await screen.findByText('1 problem')).toBeInTheDocument();
        await openBlock();
        const lead = screen.getByRole('group', { name: 'Lead' });
        expect(within(lead).getAllByText(/Has to be a link starting with/)).toHaveLength(1);
    });
});

describe('the same block on a site that publishes version 1', () => {
    beforeEach(() => serveSchema(V1));

    it('edits lists and groups with no binding picker anywhere', async () => {
        const saved = renderBlocks({ stages: FOUR, tags: ['news'] });
        await openBlock();
        fireEvent.click(screen.getByRole('button', { name: /^Stage 1/ }));
        expect(screen.queryByRole('button', { name: /^Use data/ })).toBeNull();

        fireEvent.change(screen.getByLabelText(/^Tag 1/), { target: { value: 'events' } });
        expect(saved.props().tags).toEqual(['events']);
        expect(api.get).not.toHaveBeenCalled();
    });
});
