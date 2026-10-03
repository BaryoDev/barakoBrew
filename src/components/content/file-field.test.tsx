import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FieldDefinition } from '@/types/schema';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { DynamicForm } = await import('./dynamic-form');

const COVER_ID = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';
const OTHER_ID = '7a9619ff-8b86-d011-b42d-00cf4fc964aa';

function renderForm(field: Partial<FieldDefinition>, values: Record<string, unknown>, files?: Record<string, unknown>) {
    const onChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <DynamicForm
                fields={[{ name: 'Cover', displayName: 'Cover', type: 'file', isRequired: false, ...field } as FieldDefinition]}
                values={values}
                onChange={onChange}
                files={files as never}
            />
        </QueryClientProvider>,
    );
    return onChange;
}

function filesPage(items: unknown[]) {
    return { data: { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 } };
}

describe('a file field', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the file the entry read resolved, not the id', () => {
        renderForm({}, { Cover: COVER_ID }, {
            Cover: {
                id: COVER_ID,
                url: null,
                fileName: 'harbour.png',
                contentType: 'image/png',
                size: 48213,
                alt: 'Boats at dawn',
                caption: null,
            },
        });

        expect(screen.getByText('harbour.png')).toBeInTheDocument();
        expect(screen.getByText(/private/)).toBeInTheDocument();
        expect(screen.queryByText(COVER_ID)).toBeNull();
    });

    it('says so when the id resolves to nothing this caller may download', () => {
        renderForm({}, { Cover: COVER_ID });

        expect(screen.getByText(COVER_ID)).toBeInTheDocument();
        expect(screen.getByText(/not one you can download/)).toBeInTheDocument();
    });

    it('stores the id of the file picked from Files, and lists only images for the image hint', async () => {
        vi.mocked(api.get).mockResolvedValue(
            filesPage([
                { id: COVER_ID, fileName: 'harbour.png', contentType: 'image/png', size: 1, isPublic: true, publicUrl: null, alt: null, caption: null, uploadedBy: 'u', createdAt: '2026-10-01T00:00:00Z' },
                { id: OTHER_ID, fileName: 'terms.pdf', contentType: 'application/pdf', size: 1, isPublic: true, publicUrl: null, alt: null, caption: null, uploadedBy: 'u', createdAt: '2026-10-01T00:00:00Z' },
            ]),
        );
        const onChange = renderForm({ editor: 'image' }, {});

        fireEvent.click(screen.getByRole('button', { name: 'Choose image for Cover' }));
        const pick = await screen.findByRole('button', { name: /harbour\.png/ });
        expect(screen.queryByRole('button', { name: /terms\.pdf/ })).toBeNull();
        fireEvent.click(pick);

        await waitFor(() => expect(onChange).toHaveBeenCalledWith({ Cover: COVER_ID }));
        expect(vi.mocked(api.get).mock.calls[0][0]).toBe('/api/files');
    });

    it('clears to null, which leaves no file', () => {
        const onChange = renderForm({}, { Cover: COVER_ID });

        fireEvent.click(screen.getByRole('button', { name: 'Clear Cover' }));

        expect(onChange).toHaveBeenCalledWith({ Cover: null });
    });
});
