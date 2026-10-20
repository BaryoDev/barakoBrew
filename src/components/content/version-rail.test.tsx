import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api } = await import('@/lib/api');
const { VersionRail } = await import('./version-rail');

const ID = '0b7a5b8e-7a57-4d38-9d0e-2f1f0f0c5a11';

const HISTORY = {
    items: [
        { id: ID, versionId: 'v1', changeType: 'Created', data: { Title: 'First' }, lastModifiedBy: 'ana', timestamp: '2026-09-01T00:00:00Z' },
        { id: ID, versionId: 'v2', changeType: 'StatusChanged', status: 'Published', timestamp: '2026-09-02T00:00:00Z' },
        { id: ID, versionId: 'v3', changeType: 'Updated', data: { Title: 'Third' }, lastModifiedBy: 'bea', timestamp: '2026-09-03T00:00:00Z' },
    ],
    totalItems: 3,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
};

function renderRail(canRollback: boolean) {
    vi.mocked(api.get).mockResolvedValue({ data: HISTORY });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <VersionRail id={ID} canRollback={canRollback} />
        </QueryClientProvider>,
    );
}

beforeEach(() => vi.clearAllMocks());

describe('the version rail', () => {
    it('lists versions newest first and marks the current one', async () => {
        renderRail(true);

        await screen.findByText('Edited (current)');
        const cards = screen.getAllByRole('listitem');
        expect(cards).toHaveLength(3);
        expect(cards[0]).toHaveTextContent('Edited (current)');
        expect(cards[0]).toHaveClass('border-primary');
        expect(cards[2]).toHaveTextContent('Created');
        expect(cards[2]).not.toHaveClass('border-primary');
    });

    it('previews the current version first and another after it is chosen', async () => {
        renderRail(true);

        await screen.findByText('Edited (current)');
        expect(screen.getByTestId('version-preview')).toHaveTextContent('Third');

        const cards = screen.getAllByRole('listitem');
        fireEvent.click(within(cards[2]).getByRole('button', { name: /created/i }));

        expect(screen.getAllByTestId('version-preview')).toHaveLength(1);
        expect(screen.getByTestId('version-preview')).toHaveTextContent('First');
        expect(screen.getByTestId('version-preview')).not.toHaveTextContent('Third');
    });

    it('offers Restore only on an older version that carries a document', async () => {
        renderRail(true);

        await screen.findByText('Edited (current)');
        expect(screen.getAllByRole('button', { name: /restore this version/i })).toHaveLength(1);
        const cards = screen.getAllByRole('listitem');
        expect(within(cards[2]).getByRole('button', { name: /restore this version/i })).toBeInTheDocument();
    });

    it('offers no Restore at all without the rollback capability', async () => {
        renderRail(false);

        await screen.findByText('Edited (current)');
        expect(screen.getAllByRole('listitem')).toHaveLength(3);
        expect(screen.queryByRole('button', { name: /restore this version/i })).toBeNull();
    });
});
