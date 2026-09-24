import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { FieldDefinition } from '@/types/schema';

/**
 * The block form against the tenant's own tones and style recipes, which live in its site settings.
 *
 * The site's schema is read without saying which tenant is asking, so it lists the built-in tones
 * only. The form adds the tenant's from the settings it reads, and these tests are that addition.
 */

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { DynamicForm } = await import('./dynamic-form');

const SITE_ID = '7c1f2e3d-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
const TONES = ['page', 'surface', 'accent', 'inverse', 'gradient', 'wash'];

const SCHEMA = {
    version: 2,
    bindings: { scopes: ['site', 'page', 'item', 'props'], formats: ['text'] },
    blocks: [
        {
            type: 'section',
            label: 'Section',
            layer: 'primitive',
            perViewer: false,
            fields: [
                { name: 'tone', kind: 'select', label: 'Tone', options: TONES, bindable: true },
                { name: 'recipe', kind: 'text', label: 'Style recipe', bindable: true },
                { name: 'content', kind: 'slots', label: 'Content', min: 1, max: 1 },
            ],
        },
    ],
};

const FIELDS: FieldDefinition[] = [{ name: 'Blocks', displayName: 'Blocks', type: 'json', isRequired: false }];

const SETTINGS = {
    Name: 'barakocms.com',
    Tokens: { 'cms-ink': '#1D3A8A', 'cms-bg': '#E8EEFD' },
    Tones: {
        cms: { ink: 'cms-ink', bg: 'cms-bg', edge: '#B9C8F5' },
        Loud: { ink: '#000', bg: '#fff', edge: '#fff' },
        ghost: { ink: 'no-such-token', bg: '#fff', edge: '#fff' },
    },
    StyleRecipes: { card: { style: { padding: '22px 24px' } }, eyebrow: { style: { 'font-size': '11px' } } },
};

function serve(settings: Record<string, unknown>, declared: string[] = ['Tokens', 'Tones', 'StyleRecipes']) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, status: 200, json: async () => SCHEMA })),
    );
    const types = [
        {
            name: 'site',
            displayName: 'site',
            isSingleton: true,
            fields: [
                { name: 'Name', displayName: 'Name', type: 'string', isRequired: true },
                ...declared.map((name) => ({ name, displayName: name, type: 'json', isRequired: false })),
            ],
        },
        { name: 'page', displayName: 'page', fields: [{ name: 'Blocks', displayName: 'Blocks', type: 'json', isRequired: false }] },
    ];
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types') return { data: { items: types, totalItems: types.length, page: 1, pageSize: 50 } };
        if (url === '/api/contents') return { data: { items: [{ id: SITE_ID }], totalItems: 1, page: 1, pageSize: 2 } };
        if (url === `/api/contents/${SITE_ID}`) {
            return { data: { id: SITE_ID, contentType: 'site', data: settings, status: 'Published', version: 3 }, headers: { etag: '"3"' } };
        }
        throw new Error(`unexpected GET ${url}`);
    });
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
    vi.mocked(api.get).mockReset();
    vi.stubEnv('NEXT_PUBLIC_PRESS_URL', 'https://site.example/');
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('a tone field', () => {
    it("offers the tenant's own tones after the built-in six, and saves one", async () => {
        serve(SETTINGS);
        const saved = renderBlocks([{ type: 'section', props: { content: [[]] } }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Section/ }));
        const tone = screen.getByLabelText('Tone') as HTMLSelectElement;

        await waitFor(() => expect([...tone.options].map((o) => o.value)).toContain('cms'));
        // Loud is a name the site would not store on a block, and ghost names a token nobody set, so
        // the site drops it. Neither is offered.
        expect([...tone.options].map((o) => o.value)).toEqual(['', ...TONES, 'cms']);

        fireEvent.change(tone, { target: { value: 'cms' } });
        expect(saved.current).toEqual([{ type: 'section', props: { tone: 'cms', content: [[]] } }]);
    });

    it('reads a stored tenant tone as offered, not as a problem', async () => {
        serve(SETTINGS);
        renderBlocks([{ type: 'section', props: { tone: 'cms', content: [[]] } }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Section/ }));
        const tone = screen.getByLabelText('Tone') as HTMLSelectElement;
        await waitFor(() => expect(tone.selectedOptions[0]?.textContent).toBe('cms'));
        expect(screen.queryByText(/Has to be one of/)).toBeNull();
    });
});

describe('a recipe field', () => {
    it("offers the tenant's recipe names and saves one", async () => {
        serve(SETTINGS);
        const saved = renderBlocks([{ type: 'section', props: { content: [[]] } }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Section/ }));

        const recipe = (await screen.findByRole('combobox', { name: 'Style recipe' })) as HTMLInputElement;
        const list = document.getElementById(recipe.getAttribute('list')!) as HTMLDataListElement;
        expect([...list.options].map((o) => o.value)).toEqual(['card', 'eyebrow']);

        fireEvent.change(recipe, { target: { value: 'card' } });
        expect(saved.current).toEqual([{ type: 'section', props: { recipe: 'card', content: [[]] } }]);
    });

    it('keeps a bound name and says nothing about it, and flags a name the site does not have', async () => {
        serve(SETTINGS);
        renderBlocks([{ type: 'section', props: { recipe: 'card-{{item.Product}}', content: [[]] } }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Section/ }));
        const recipe = (await screen.findByRole('combobox', { name: 'Style recipe' })) as HTMLInputElement;
        expect(recipe.value).toBe('card-{{item.Product}}');
        expect(screen.queryByText(/no recipe called/)).toBeNull();

        fireEvent.change(recipe, { target: { value: 'cardd' } });
        expect(screen.getByText('This site has no recipe called "cardd", so the block draws its own look.')).toBeTruthy();
    });

    it('flags a name with a trailing space, which the site does not trim', async () => {
        serve(SETTINGS);
        const saved = renderBlocks([{ type: 'section', props: { content: [[]] } }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Section/ }));
        const recipe = (await screen.findByRole('combobox', { name: 'Style recipe' })) as HTMLInputElement;
        fireEvent.change(recipe, { target: { value: 'card ' } });
        expect(saved.current).toEqual([{ type: 'section', props: { recipe: 'card ', content: [[]] } }]);
        expect(screen.getByText('This site has no recipe called "card ", so the block draws its own look.')).toBeTruthy();
    });

    it('is a plain text field for a tenant with no recipes', async () => {
        serve({ Name: 'plain' });
        renderBlocks([{ type: 'section', props: { content: [[]] } }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Section/ }));
        await screen.findByLabelText(/^Style recipe/);
        expect(screen.queryByRole('combobox', { name: 'Style recipe' })).toBeNull();
    });
});

describe('settings the site type does not declare', () => {
    it('offer no tones and no recipes, since the site cannot read them', async () => {
        serve(SETTINGS, []);
        renderBlocks([{ type: 'section', props: { content: [[]] } }]);
        fireEvent.click(await screen.findByRole('button', { name: /^Section/ }));
        // Wait for the site entry, which the tone field has read once Name's type is known.
        await waitFor(() => expect(vi.mocked(api.get)).toHaveBeenCalledWith(`/api/contents/${SITE_ID}`));
        await new Promise((r) => setTimeout(r, 50));
        const tone = screen.getByLabelText('Tone') as HTMLSelectElement;
        expect([...tone.options].map((o) => o.value)).toEqual(['', ...TONES]);
        expect(screen.queryByRole('combobox', { name: 'Style recipe' })).toBeNull();
    });
});
