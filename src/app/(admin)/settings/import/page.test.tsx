import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SheetPreview } from '@/hooks/use-import';
import type { ContentTypeDefinition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return {
        ...actual,
        api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
    };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix sizes its dialog with one, and jsdom ships no implementation.
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { default: ImportPage } = await import('./page');

const posts: ContentTypeDefinition = {
    name: 'Post',
    displayName: 'Post',
    fields: [{ name: 'Title', displayName: 'Title', type: 'text' } as ContentTypeDefinition['fields'][number]],
};

/** What the analyze endpoint answers for a sheet longer than its 500 row preview. */
function truncatedSheet(): SheetPreview {
    const rows = [[{ kind: 'Text', value: 'Title' }]];
    for (let i = 1; i < 500; i += 1) rows.push([{ kind: 'Text', value: `Post ${i}` }]);
    return { rowCount: 1200, columnCount: 1, suggestedHeaderRow: 0, truncated: true, rows };
}

async function renderWithSheet(preview: SheetPreview) {
    vi.mocked(api.get).mockResolvedValue({
        data: { items: [posts], page: 1, pageSize: 50, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    vi.mocked(api.post).mockImplementation(async (url: string) => {
        if (url === '/api/import/analyze') return { data: preview };
        return { data: { created: 499, failed: 0, errors: [] } };
    });

    render(
        React.createElement(
            QueryClientProvider,
            { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
            React.createElement(ImportPage),
        ),
    );

    fireEvent.change(screen.getByLabelText('Spreadsheet to import'), {
        target: { files: [new File(['Title'], 'posts.csv', { type: 'text/csv' })] },
    });
    await screen.findByText('2. Say which row holds the headings');
    await screen.findByRole('option', { name: 'Post' });
    fireEvent.change(screen.getByLabelText('Content type'), { target: { value: 'Post' } });
    fireEvent.change(screen.getByLabelText('Field for Title'), { target: { value: 'Title' } });
}

function importCalls() {
    return vi.mocked(api.post).mock.calls.filter(([url]) => url === '/api/import/content');
}

describe('importing a sheet longer than the preview', () => {
    beforeEach(() => {
        vi.mocked(api.get).mockReset();
        vi.mocked(api.post).mockReset();
    });

    it('names the rows that will not be imported and imports only after the user confirms', async () => {
        await renderWithSheet(truncatedSheet());

        expect(
            screen.getByText(/This sheet has 1200 rows\. Only the first 500 can be imported from the console, so the last 700 rows, counting blank ones, will not be imported\./),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Import 499 entries' }));

        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toHaveTextContent('The last 700 rows of the sheet, counting blank ones, will not be imported.');
        expect(importCalls()).toHaveLength(0);

        fireEvent.click(screen.getByRole('button', { name: 'Import 499 entries' }));

        await waitFor(() => expect(importCalls()).toHaveLength(1));
        const body = importCalls()[0][1] as { records: unknown[] };
        expect(body.records).toHaveLength(499);
    });

    it('imports a sheet that fit in the preview without asking', async () => {
        const preview = truncatedSheet();
        await renderWithSheet({ ...preview, rowCount: 500, truncated: false });

        expect(screen.queryByText(/will not be imported/)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Import 499 entries' }));

        await waitFor(() => expect(importCalls()).toHaveLength(1));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
});
