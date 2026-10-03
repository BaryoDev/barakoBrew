import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/use-site', () => ({
    useSiteEntry: () => ({ kind: 'entry', entry: { data: { Url: 'https://club.example.org/' } } }),
}));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { EntrySharePanel } = await import('./entry-share-panel');

function renderPanel(fields: { name: string; displayName: string; type: string; isRequired: boolean }[], data: Record<string, unknown>) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <EntrySharePanel entryId="e1" contentType="article" fields={fields as never} data={data} />
        </QueryClientProvider>,
    );
}

const SLUG_FIELD = { name: 'Slug', displayName: 'Slug', type: 'slug', isRequired: true };

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.get).mockResolvedValue({ data: { items: [] } });
});

describe('EntrySharePanel', () => {
    it('issues a preview token by type and slug and shows it as a link on the site', async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { token: 'prev-KEY', expiresAt: '2026-10-03T12:30:00Z', queryParam: 'preview' },
        });

        renderPanel([SLUG_FIELD], { Slug: 'hello' });

        expect(screen.getByLabelText('Path on the site')).toHaveValue('/article/hello');
        fireEvent.click(screen.getByRole('button', { name: 'Issue preview link' }));

        expect(await screen.findByRole('textbox', { name: 'Preview link' })).toHaveValue(
            'https://club.example.org/article/hello?preview=prev-KEY',
        );
        expect(api.post).toHaveBeenCalledWith('/api/preview', { type: 'article', slug: 'hello' });
    });

    it('uses the path the editor corrects it to', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { token: 't', expiresAt: '2026-10-03T12:30:00Z' } });

        renderPanel([SLUG_FIELD], { Slug: 'hello' });
        fireEvent.change(screen.getByLabelText('Path on the site'), { target: { value: '/blog/hello' } });
        fireEvent.click(screen.getByRole('button', { name: 'Issue preview link' }));

        expect(await screen.findByRole('textbox', { name: 'Preview link' })).toHaveValue(
            'https://club.example.org/blog/hello?preview=t',
        );
    });

    it('offers no preview link for an entry with no slug, and says why', () => {
        renderPanel([{ name: 'Title', displayName: 'Title', type: 'string', isRequired: true }], { Title: 'x' });

        expect(screen.queryByRole('button', { name: 'Issue preview link' })).toBeNull();
        expect(screen.getByText(/no slug field/)).toBeInTheDocument();
    });
});
