import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DynamicForm } from './dynamic-form';
import type { FieldDefinition } from '@/types/schema';

/** The block count warning, against the limit the site publishes and the built-in one. */

const BLOCKS = [
    {
        type: 'richText',
        label: 'Rich text',
        perViewer: false,
        fields: [{ name: 'markdown', kind: 'markdown', label: 'Text' }],
    },
];

const FIELDS: FieldDefinition[] = [{ name: 'Blocks', displayName: 'Blocks', type: 'json', isRequired: false }];

const MANY = Array.from({ length: 150 }, (_, i) => ({ type: 'richText', props: { markdown: `Block ${i}` } }));

function renderWith(schema: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => schema })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <DynamicForm contentType="page" fields={FIELDS} values={{ Blocks: MANY }} onChange={() => {}} />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_PRESS_URL', 'https://site.example');
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('the block count warning', () => {
    it('does not warn at 150 blocks when the site says it shows 200', async () => {
        renderWith({ version: 1, blocks: BLOCKS, limits: { maxBlocks: 200 } });
        expect(await screen.findAllByRole('listitem')).not.toHaveLength(0);
        expect(screen.queryByText(/This page holds/)).toBeNull();
    });

    it('warns at 150 blocks against the built-in 100 when the site publishes no limit', async () => {
        renderWith({ version: 1, blocks: BLOCKS });
        expect(await screen.findByText('This page holds 150 blocks, and the site shows the first 100.')).toBeInTheDocument();
    });

    it('names the limit the site published in the warning', async () => {
        renderWith({ version: 1, blocks: BLOCKS, limits: { maxBlocks: 120 } });
        expect(await screen.findByText('This page holds 150 blocks, and the site shows the first 120.')).toBeInTheDocument();
    });
});
