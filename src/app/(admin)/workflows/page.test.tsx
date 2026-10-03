import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// Radix sizes its dialog with one, and jsdom ships no implementation.
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { default: WorkflowsPage } = await import('./page');

function workflow(id: string, name: string, extra: Record<string, unknown> = {}) {
    return {
        id,
        name,
        triggerContentType: 'post',
        triggerEvent: 'Published',
        conditions: {},
        actions: [{ type: 'Webhook', parameters: {} }],
        ...extra,
    };
}

function renderWith(items: unknown[]) {
    vi.mocked(api.get).mockResolvedValue({
        data: { items, page: 1, pageSize: 25, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <WorkflowsPage />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(api.delete).mockReset();
    push.mockReset();
});

describe('the workflow list', () => {
    it('switches a workflow off without opening it', async () => {
        vi.mocked(api.put).mockResolvedValue({ data: {} });
        renderWith([workflow('w1', 'Announce', { enabled: true }), workflow('w2', 'Archive', { enabled: false })]);

        const on = await screen.findByRole('switch', { name: 'Announce is on' });
        expect(on).toBeChecked();
        expect(screen.getByRole('switch', { name: 'Archive is on' })).not.toBeChecked();

        fireEvent.click(on);

        await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/workflows/w1/enabled', { enabled: false }));
        expect(push).not.toHaveBeenCalled();
    });

    it('deletes a workflow only after confirming, and does not open it', async () => {
        vi.mocked(api.delete).mockResolvedValue({ status: 204 });
        renderWith([workflow('w1', 'Announce', { enabled: true })]);

        fireEvent.click(await screen.findByRole('button', { name: 'Delete Announce' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(api.delete).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/workflows/w1'));
        expect(push).not.toHaveBeenCalled();
    });

    it('offers neither control on an API whose workflows carry no enabled field', async () => {
        renderWith([workflow('w1', 'Announce'), workflow('w2', 'Archive')]);

        expect(await screen.findByText('Announce')).toBeInTheDocument();
        expect(screen.getByText('Archive')).toBeInTheDocument();
        expect(screen.queryByRole('switch')).toBeNull();
        expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
    });

    it('still opens a workflow from its row', async () => {
        renderWith([workflow('w1', 'Announce', { enabled: true })]);

        fireEvent.click(await screen.findByText('Announce'));

        expect(push).toHaveBeenCalledWith('/workflows/w1');
    });
});
