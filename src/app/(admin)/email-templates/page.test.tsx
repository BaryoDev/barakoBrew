import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { default: EmailTemplatesPage } = await import('./page');

function page<T>(items: T[]) {
    return { items, page: 1, pageSize: 100, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
}

const WELCOME = { id: 't1', contentType: 'email-template', status: 'Published', sensitivity: 'Public', createdAt: '', updatedAt: '', data: { Name: 'Welcome', Slug: 'welcome' } };
const RECEIPT = { id: 't2', contentType: 'email-template', status: 'Draft', sensitivity: 'Public', createdAt: '', updatedAt: '', data: { Name: 'Receipt', Slug: 'receipt' } };

function workflow(id: string, name: string, template: string) {
    return { id, name, triggerContentType: 'booking', triggerEvent: 'Created', conditions: {}, actions: [{ type: 'Email', parameters: { To: 'a@example.com', Template: template } }] };
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockImplementation((async (url: string, config?: { params?: Record<string, unknown> }) => {
        if (url === '/api/contents' && config?.params?.contentType === 'email-template') return { data: page([WELCOME, RECEIPT]) };
        if (url === '/api/workflows') {
            return { data: page([workflow('w1', 'Greet a booker', 'WELCOME'), workflow('w2', 'Greet a member', 't1'), workflow('w3', 'Bill', 'other')]) };
        }
        throw new Error(`unexpected GET ${url}`);
    }) as typeof api.get);
});

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<EmailTemplatesPage />, {
        wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
}

describe('the email templates list', () => {
    it('names the workflows that use each template, by slug or by id', async () => {
        renderPage();

        const used = await screen.findByRole('list', { name: 'Workflows using Welcome' });
        const names = within(used).getAllByRole('listitem').map((li) => li.textContent);
        expect(names).toHaveLength(2);
        expect(names).toEqual(['Greet a booker', 'Greet a member']);
        expect(screen.queryByRole('list', { name: 'Workflows using Receipt' })).not.toBeInTheDocument();
        expect(screen.getByText('No workflow')).toBeInTheDocument();
    });

    it('links each template to its editor', async () => {
        renderPage();

        expect(await screen.findByRole('link', { name: 'Receipt' })).toHaveAttribute('href', '/email-templates/t2');
    });
});
