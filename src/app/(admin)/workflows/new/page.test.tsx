import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WorkflowActionMetadata } from '@/types/workflow';

/**
 * The new workflow form, for the barakoPress cache invalidation workflow: a Published trigger and
 * one Webhook action with a Url and a Secret. Before this, neither half could be entered.
 */
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { api } = await import('@/lib/api');
const { default: NewWorkflowPage } = await import('./page');

// As GET /api/workflows/actions returns WebhookAction on barakoCMS master.
const ACTIONS: WorkflowActionMetadata[] = [
    {
        type: 'Webhook',
        description: 'Send HTTP POST requests to external webhooks, signed when a Secret is set',
        requiredParameters: ['Url'],
        exampleConfiguration:
            '{"Type":"Webhook","Parameters":{"Url":"https://example.com/webhook","Secret":"a shared secret, optional"}}',
    },
];

function page<T>(items: T[]) {
    return { items, page: 1, pageSize: 100, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
}

beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.get).mockImplementation((async (url: string) => {
        if (url === '/api/content-types') return { data: page([{ name: 'post', displayName: 'Post', fields: [] }]) };
        if (url === '/api/workflows/actions') return { data: ACTIONS };
        if (url === '/api/workflows/variables') return { data: { systemVariables: [], dataFields: [] } };
        throw new Error(`unexpected GET ${url}`);
    }) as typeof api.get);
    vi.mocked(api.post).mockResolvedValue({ data: {} });
});

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewWorkflowPage />, {
        wrapper: ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
    });
}

/** Radix opens from the keyboard, which jsdom can drive, and selects on Enter. */
async function choose(combobox: string, option: string) {
    fireEvent.keyDown(screen.getByRole('combobox', { name: combobox }), { key: 'ArrowDown' });
    const item = await within(screen.getByRole('listbox')).findByRole('option', { name: option });
    fireEvent.keyDown(item, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
}

async function addWebhook() {
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workflows/actions'));
    await choose('Add an action', 'Webhook');
    return screen.findByLabelText(/^Url/);
}

describe('the new workflow form', () => {
    it('offers Published as a trigger, alongside Created and Updated', async () => {
        renderPage();
        fireEvent.keyDown(screen.getByRole('combobox', { name: /is$/ }), { key: 'ArrowDown' });
        const options = within(await screen.findByRole('listbox')).getAllByRole('option');

        expect(options).toHaveLength(3);
        expect(options.map((o) => o.textContent)).toEqual(['Created', 'Updated', 'Published']);
    });

    it('renders the Webhook Secret as a masked, optional input', async () => {
        renderPage();
        await addWebhook();

        const secret = screen.getByLabelText(/^Secret/);
        expect(secret).toHaveAttribute('type', 'password');
        expect(secret).toHaveAttribute('autocomplete', 'new-password');
        expect(screen.getByText('(optional)')).toBeInTheDocument();
        expect(screen.getByLabelText(/^Url/)).toHaveAttribute('type', 'text');
    });

    it('sends a Published trigger and the typed Secret when the workflow is created', async () => {
        renderPage();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Invalidate the site cache' } });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        await choose('When an entry of type…', 'Post');
        await choose('…is', 'Published');
        const url = await addWebhook();
        fireEvent.change(url, { target: { value: 'https://site.example/api/revalidate' } });
        fireEvent.change(screen.getByLabelText(/^Secret/), { target: { value: 'shared-s3cret' } });

        fireEvent.click(screen.getByRole('button', { name: 'Create workflow' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        expect(vi.mocked(api.post).mock.calls[0]).toEqual([
            '/api/workflows',
            {
                name: 'Invalidate the site cache',
                triggerContentType: 'post',
                triggerEvent: 'Published',
                conditions: {},
                actions: [
                    {
                        type: 'Webhook',
                        parameters: { Url: 'https://site.example/api/revalidate', Secret: 'shared-s3cret' },
                    },
                ],
            },
        ]);
    });

    it('does not send an empty Secret when one was typed and then cleared', async () => {
        renderPage();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsigned hook' } });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/content-types'));
        await choose('When an entry of type…', 'Post');
        const url = await addWebhook();
        fireEvent.change(url, { target: { value: 'https://site.example/hook' } });
        // Typed and cleared, so the form state holds Secret: '' rather than no Secret at all.
        fireEvent.change(screen.getByLabelText(/^Secret/), { target: { value: 'oops' } });
        fireEvent.change(screen.getByLabelText(/^Secret/), { target: { value: '' } });

        fireEvent.click(screen.getByRole('button', { name: 'Create workflow' }));

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const body = vi.mocked(api.post).mock.calls[0][1] as { actions: { parameters: Record<string, string> }[] };
        expect(body.actions).toHaveLength(1);
        expect(body.actions[0].parameters).toEqual({ Url: 'https://site.example/hook' });
    });
});
