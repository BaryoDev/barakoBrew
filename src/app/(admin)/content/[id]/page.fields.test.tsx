import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentStatus } from '@/types/content';

/**
 * The entry editor against a type using the 4.6 members: a token it must never send, a refused
 * save it must keep on screen, and a lifecycle it must move by transitions.
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
    useAuth: () => ({ user: { id: 'u1', username: 'a', roles: ['SuperAdmin'] } }),
}));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { default: ContentDetailPage } = await import('./page');

const ID = '0b7a5b8e-7a57-4d38-9d0e-2f1f0f0c5a11';
const TOKEN = 'abcdefghjkmnpqrstvwxyz0123456789';

const SCHEMA = {
    name: 'ticket',
    displayName: 'Ticket',
    fields: [
        { name: 'Email', displayName: 'Email', type: 'email', isRequired: false },
        { name: 'Claim', displayName: 'Claim', type: 'token', isRequired: false, sensitivity: 'Hidden' },
    ],
};

function renderEditor(schema: Record<string, unknown> = SCHEMA) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types') {
            return { data: { items: [schema], totalItems: 1, page: 1, pageSize: 20 } };
        }
        if (url === `/api/contents/${ID}`) {
            return {
                data: {
                    id: ID,
                    contentType: 'ticket',
                    data: { Email: 'ana@example.com', Claim: TOKEN },
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

function uniquenessRefusal(reason: string) {
    return Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: { status: 409, data: { status: 409, errors: [{ name: '', reason }] } },
    });
}

describe('an entry with a token field', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the token read only and never sends it on save', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { id: ID, version: 2 }, headers: {} });
        renderEditor();

        const save = await screen.findByRole('button', { name: /save changes/i });
        const token = document.getElementById('Claim') as HTMLInputElement;
        expect(token).toHaveAttribute('readonly');
        expect(token.value).toBe(TOKEN);

        fireEvent.change(document.getElementById('Email')!, { target: { value: 'ben@example.com' } });
        fireEvent.click(save);

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        const [, body] = vi.mocked(api.put).mock.calls[0];
        expect((body as { data: Record<string, unknown> }).data).toEqual({ Email: 'ben@example.com' });
    });
});

describe('a save refused by a uniqueness rule', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stays on the page in the API words, with no retry', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(
            uniquenessRefusal(
                "The rule 'OnePerEmail' on 'ticket' allows one entry per value, and another entry already holds this one.",
            ),
        );
        renderEditor();

        fireEvent.click(await screen.findByRole('button', { name: /save changes/i }));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent("The rule 'OnePerEmail' on 'ticket' allows one entry per value");
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    it('offers a retry for the try again shortly answer, and it saves', async () => {
        vi.mocked(api.put)
            .mockRejectedValueOnce(
                uniquenessRefusal(
                    "Another write of the same values under the rule 'OnePerEmail' on 'ticket' has not finished. Try again shortly.",
                ),
            )
            .mockResolvedValueOnce({ data: { id: ID, version: 2 }, headers: {} });
        renderEditor();

        fireEvent.click(await screen.findByRole('button', { name: /save changes/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });
});

describe('an entry of a type with its own lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('offers the type transitions instead of Publish and Archive', async () => {
        renderEditor({
            ...SCHEMA,
            lifecycle: {
                states: ['Open', 'Closed'],
                initialState: 'Open',
                transitions: [{ name: 'Close', from: 'Open', to: 'Closed' }],
            },
        });

        expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
        expect(screen.queryByRole('button', { name: /Archive/ })).toBeNull();
    });
});
