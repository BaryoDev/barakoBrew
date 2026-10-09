import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentStatus } from '@/types/content';

/**
 * An entry holding a value its choice field stopped offering. Up to API contract 6 the API refuses
 * that entry on its next save, so the editor says which field and does not send the save until it
 * is changed. From contract 7 the API checks only a choice that changed, so the save goes through.
 */
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: { id: 'u1', username: 'a', roles: ['Admin'] } }),
}));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { default: ContentDetailPage } = await import('./page');
const { recordContractVersion, __resetContractForTests } = await import('@/lib/api-contract');

const ID = '0b7a5b8e-7a57-4d38-9d0e-2f1f0f0c5a11';

const SCHEMA = {
    name: 'registration',
    displayName: 'Registration',
    fields: [
        {
            name: 'EntryType',
            displayName: 'Entry type',
            type: 'choice',
            isRequired: false,
            options: [
                { value: 'FUN', label: 'Fun run' },
                { value: 'COMPETE', label: 'Competitive' },
            ],
            multiple: false,
        },
    ],
};

function renderEditor(stored: string) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types') {
            return { data: { items: [SCHEMA], totalItems: 1, page: 1, pageSize: 20 } };
        }
        if (url === `/api/contents/${ID}`) {
            return {
                data: {
                    id: ID,
                    contentType: 'registration',
                    data: { EntryType: stored },
                    status: ContentStatus.Draft,
                    sensitivity: 'Public',
                    version: 1,
                    createdAt: '2026-09-01T00:00:00Z',
                    updatedAt: '2026-09-01T00:00:00Z',
                },
                headers: {},
            };
        }
        return { data: { items: [], totalItems: 0, page: 1, pageSize: 20 } };
    });
    vi.mocked(api.put).mockResolvedValue({ data: { id: ID, version: 2 }, headers: {} });

    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const params = Object.assign(Promise.resolve({ id: ID }), {
        status: 'fulfilled' as const,
        value: { id: ID },
    });
    render(
        <QueryClientProvider client={client}>
            <React.Suspense fallback={null}>
                <ContentDetailPage params={params} />
            </React.Suspense>
        </QueryClientProvider>,
    );
}

describe('a stored choice value no longer offered', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetContractForTests();
    });

    it('blocks the save with a message until another value is picked, against contract 6', async () => {
        recordContractVersion('6');
        renderEditor('WALK');

        const save = await screen.findByRole('button', { name: /save changes/i });
        expect(save).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent('not offered any more');

        fireEvent.click(save);
        expect(api.put).not.toHaveBeenCalled();

        fireEvent.click(screen.getByLabelText('Fun run'));
        expect(save).toBeEnabled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        fireEvent.click(save);
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        const [, body] = vi.mocked(api.put).mock.calls[0];
        expect((body as { data: Record<string, unknown> }).data).toEqual({ EntryType: 'FUN' });
    });

    it('lets the entry save with the stored value kept, against contract 7', async () => {
        recordContractVersion('7');
        renderEditor('WALK');

        const save = await screen.findByRole('button', { name: /save changes/i });
        expect(screen.getByText('"WALK" is not offered any more.')).toBeInTheDocument();
        expect(save).toBeEnabled();

        fireEvent.click(save);
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        const [, body] = vi.mocked(api.put).mock.calls[0];
        expect((body as { data: Record<string, unknown> }).data).toEqual({ EntryType: 'WALK' });
    });

    it('leaves the save alone when the stored value is still offered', async () => {
        renderEditor('COMPETE');

        const save = await screen.findByRole('button', { name: /save changes/i });
        expect(save).toBeEnabled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
