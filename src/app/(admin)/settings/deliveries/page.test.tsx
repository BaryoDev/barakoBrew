import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn() } };
});

let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
    useSearchParams: () => search,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { default: DeliveriesPage } = await import('./page');

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false });

const REQUEST_ROW = {
    id: 'r1',
    workflowId: 'w1',
    connectorSlug: 'crm',
    requestSlug: 'push-lead',
    method: 'POST',
    url: 'https://crm.example.com',
    event: 'Created',
    requestsSent: 2,
    responseStatus: null,
    responseBody: null,
    durationMs: 30,
    error: 'The token endpoint at id.example.com answered 401 (invalid_client).',
    attempt: 3,
    createdAt: '2026-10-03T10:00:00Z',
};

const WEBHOOK_ROW = {
    id: 'h1',
    workflowId: 'w2',
    url: 'https://hooks.example.com',
    event: 'Published',
    requestHeaders: {},
    responseStatus: 200,
    responseBody: '{"ok":true}',
    durationMs: 8,
    error: null,
    attempt: 1,
    createdAt: '2026-10-03T09:00:00Z',
};

function notFound() {
    return new AxiosError('nf', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 404, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() },
    });
}

function renderPage(handler: (url: string, config?: { params?: Record<string, unknown> }) => unknown) {
    vi.mocked(api.get).mockImplementation((async (url: string, config?: { params?: Record<string, unknown> }) =>
        handler(url, config)) as typeof api.get);
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <DeliveriesPage />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    search = new URLSearchParams();
});

describe('the deliveries screen', () => {
    it('lists request deliveries with target, attempt count and the error as the API wrote it', async () => {
        renderPage((url) => {
            if (url === '/api/connector-deliveries') return { data: page([REQUEST_ROW]) };
            throw new Error(`unexpected GET ${url}`);
        });

        const rows = (await screen.findAllByRole('row')).slice(1);
        expect(rows).toHaveLength(1);
        expect(within(rows[0]).getByText('POST crm / push-lead')).toBeInTheDocument();
        expect(within(rows[0]).getByText('attempt 3, 2 sent')).toBeInTheDocument();
        expect(within(rows[0]).getByText('No response')).toBeInTheDocument();
        expect(within(rows[0]).getByText(REQUEST_ROW.error)).toBeInTheDocument();
    });

    it('switches to webhook deliveries and shows a body the caller may read', async () => {
        renderPage((url) => {
            if (url === '/api/connector-deliveries') return { data: page([REQUEST_ROW]) };
            if (url === '/api/webhook-deliveries') return { data: page([WEBHOOK_ROW]) };
            throw new Error(`unexpected GET ${url}`);
        });
        await screen.findByText('POST crm / push-lead');

        fireEvent.click(screen.getByRole('radio', { name: 'Webhooks' }));

        expect(await screen.findByText('https://hooks.example.com')).toBeInTheDocument();
        expect(screen.getByText('{"ok":true}')).toBeInTheDocument();
        expect(screen.queryByText('POST crm / push-lead')).toBeNull();
    });

    it('filters by status and by the connector it was opened for', async () => {
        search = new URLSearchParams('kind=requests&connector=crm');
        const asked: Record<string, unknown>[] = [];
        renderPage((url, config) => {
            asked.push(config?.params ?? {});
            return { data: page([REQUEST_ROW]) };
        });
        await screen.findByText('POST crm / push-lead');
        expect(asked[0]).toMatchObject({ connector: 'crm', page: 1 });

        fireEvent.change(screen.getByLabelText('Status'), { target: { value: '4xx' } });

        await waitFor(() => expect(asked.at(-1)).toMatchObject({ status: '4xx', connector: 'crm' }));
    });

    it('says an older API has no request delivery list', async () => {
        renderPage(() => {
            throw notFound();
        });

        expect(await screen.findByText('This API does not list these')).toBeInTheDocument();
        expect(screen.getByText(/barakoCMS 4.6/)).toBeInTheDocument();
    });
});
