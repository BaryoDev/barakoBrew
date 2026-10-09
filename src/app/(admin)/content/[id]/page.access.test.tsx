import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentStatus } from '@/types/content';

/**
 * The entry page against barakoCMS 4.7 and 4.8: what the caller may do comes from GET /api/me, a
 * value stored under another spelling of its field name is read and saved under that spelling, and
 * a link with ?transition= opens that transition's dialog.
 */
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

const session = vi.hoisted(() => ({ user: { userId: 'u1', username: 'r', roles: ['Registrar'] as string[] } }));

vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: session.user }),
}));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { toast } = await import('sonner');
const { default: ContentDetailPage } = await import('./page');

const ID = '0b7a5b8e-7a57-4d38-9d0e-2f1f0f0c5a11';

const notFound = () =>
    Object.assign(new Error('Request failed with status code 404'), {
        isAxiosError: true,
        response: { status: 404, data: {} },
    });

const SCHEMA = {
    name: 'staff',
    displayName: 'Staff',
    fields: [
        { name: 'Title', displayName: 'Title', type: 'string', isRequired: false },
        { name: 'Salary', displayName: 'Salary', type: 'string', isRequired: false, sensitivity: 'Sensitive' },
    ],
};

interface Setup {
    schema?: Record<string, unknown>;
    data?: Record<string, unknown>;
    /** The /api/me answer, or 'missing' for an API older than 4.7. */
    me?: { roles: { id: string; name: string }[]; capabilities: string[] } | 'missing';
    transition?: string;
}

function renderEditor({ schema = SCHEMA, data = { Title: 'Ana', Salary: '90000' }, me = 'missing', transition }: Setup = {}) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/me') {
            if (me === 'missing') throw notFound();
            return { data: { userId: 'u1', username: 'r', tenant: 'default', ...me } };
        }
        if (url === '/api/content-types') {
            return { data: { items: [schema], totalItems: 1, page: 1, pageSize: 20 } };
        }
        if (url === `/api/contents/${ID}`) {
            return {
                data: {
                    id: ID,
                    contentType: schema.name,
                    data,
                    status: ContentStatus.Draft,
                    sensitivity: 'Public',
                    version: 2,
                    createdAt: '2026-09-01T00:00:00Z',
                    updatedAt: '2026-09-01T00:00:00Z',
                },
                headers: {},
            };
        }
        if (url === `/api/contents/${ID}/history`) {
            const version = (n: number) => ({
                id: ID,
                versionId: `v${n}`,
                changeType: n === 1 ? 'Created' : 'Updated',
                data,
                timestamp: `2026-09-0${n}T00:00:00Z`,
            });
            return { data: { items: [version(1), version(2)], totalItems: 2, page: 1, pageSize: 20 } };
        }
        return { data: { items: [], totalItems: 0, page: 1, pageSize: 20 } };
    });

    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const thenable = <T,>(value: T) => Object.assign(Promise.resolve(value), { status: 'fulfilled' as const, value });
    render(
        <QueryClientProvider client={client}>
            <React.Suspense fallback={null}>
                <ContentDetailPage
                    params={thenable({ id: ID })}
                    searchParams={thenable(transition === undefined ? {} : { transition })}
                />
            </React.Suspense>
        </QueryClientProvider>,
    );
}

const REGISTRAR = { id: 'r-1', name: 'Registrar' };

beforeEach(() => {
    vi.clearAllMocks();
    session.user = { userId: 'u1', username: 'r', roles: ['Registrar'] };
});

describe('Sensitive fields', () => {
    it('are editable for a custom role holding view_sensitive', async () => {
        renderEditor({ me: { roles: [REGISTRAR], capabilities: ['view_sensitive'] } });

        await screen.findByRole('button', { name: /save changes/i });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
        await waitFor(() => expect(document.getElementById('Salary')).not.toHaveAttribute('readonly'));
    });

    it('stay read only for that role against an API without /api/me, as before', async () => {
        renderEditor({ me: 'missing' });

        await screen.findByRole('button', { name: /save changes/i });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
        expect(document.getElementById('Salary')).toHaveAttribute('readonly');
    });
});

describe('rollback', () => {
    async function openHistory() {
        const tab = await screen.findByRole('tab', { name: /history/i });
        fireEvent.mouseDown(tab);
        fireEvent.click(tab);
        await screen.findByText(/Created/);
    }

    it('is offered to a custom role holding rollback_content', async () => {
        renderEditor({ me: { roles: [REGISTRAR], capabilities: ['rollback_content'] } });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
        await openHistory();

        expect(await screen.findByRole('button', { name: /restore this version/i })).toBeInTheDocument();
    });

    it('is not offered to an Admin by name whose role the API says lacks it', async () => {
        session.user = { userId: 'u1', username: 'a', roles: ['Admin'] };
        renderEditor({ me: { roles: [{ id: 'r-2', name: 'Admin' }], capabilities: ['upload_files'] } });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
        await openHistory();

        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        expect(screen.queryByRole('button', { name: /restore this version/i })).toBeNull();
    });

    it('is offered to an Admin by name against an API without /api/me', async () => {
        session.user = { userId: 'u1', username: 'a', roles: ['Admin'] };
        renderEditor({ me: 'missing' });
        await openHistory();

        expect(await screen.findByRole('button', { name: /restore this version/i })).toBeInTheDocument();
    });
});

describe('a value stored under another spelling of its field name', () => {
    it('is shown, and saved back under the stored key only', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { id: ID, version: 3 }, headers: {} });
        renderEditor({ data: { title: 'Stored lower', Salary: '***' } });

        const save = await screen.findByRole('button', { name: /save changes/i });
        const title = document.getElementById('Title') as HTMLInputElement;
        expect(title.value).toBe('Stored lower');

        fireEvent.change(title, { target: { value: 'Changed' } });
        fireEvent.click(save);

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        const [, body] = vi.mocked(api.put).mock.calls[0];
        expect((body as { data: Record<string, unknown> }).data).toEqual({ title: 'Changed', Salary: '***' });
    });
});

describe('a link naming a transition', () => {
    const LIFECYCLE = {
        ...SCHEMA,
        lifecycle: {
            states: ['Review', 'Approved', 'Draft'],
            initialState: 'Review',
            transitions: [
                { name: 'Approve', from: 'Review', to: 'Approved' },
                { name: 'Reject', from: 'Review', to: 'Draft', requiredFields: ['Title'] },
            ],
        },
    };

    it('opens that transition dialog, asking before a move that takes no fields', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: { message: 'Approve moved this entry to Approved' } });
        renderEditor({ schema: LIFECYCLE, transition: 'approve' });

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByRole('heading', { name: 'Approve' })).toBeInTheDocument();
        expect(api.put).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
        await waitFor(() => expect(api.put).toHaveBeenCalledWith(`/api/contents/${ID}/status`, { id: ID, transition: 'Approve' }));
    });

    it('opens a transition that asks for fields with its fields', async () => {
        renderEditor({ schema: LIFECYCLE, transition: 'Reject' });

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByRole('heading', { name: 'Reject' })).toBeInTheDocument();
        expect(within(dialog).getByLabelText(/Title/)).toBeInTheDocument();
    });

    it('is ignored when the type declares no transition by that name', async () => {
        renderEditor({ schema: LIFECYCLE, transition: 'Publish' });

        expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('is ignored for a type with no lifecycle', async () => {
        renderEditor({ transition: 'Approve' });

        await screen.findByRole('button', { name: /save changes/i });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(toast.error).not.toHaveBeenCalled();
    });
});
