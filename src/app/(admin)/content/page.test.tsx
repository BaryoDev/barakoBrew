import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentStatus, SensitivityLevel } from '@/types/content';

/**
 * The filter bar, and what it asks the server for.
 *
 * Every control here filters server side. That is the thing worth pinning: filtering the twenty
 * rows a page happens to hold, beside a count the server produced for the whole collection, is a
 * control that lies about what it searched. So the fixtures deliberately return rows that do not
 * match what was typed. A browser-side filter would show an empty table; asking the server shows
 * what the server sent.
 */
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => searchParams,
}));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { default: ContentListPage } = await import('./page');

const SCHEMAS = [
    { name: 'article', displayName: 'Article', isSingleton: false, isPubliclyDeliverable: true, fields: [] },
];

function row(id: string, title: string, status: string, version?: number) {
    return {
        id,
        contentType: 'article',
        data: { Title: title },
        status,
        sensitivity: SensitivityLevel.Public,
        ...(version === undefined ? {} : { version }),
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
    };
}

/** Every row the server returns, whatever was asked for. */
let rows: ReturnType<typeof row>[];

/** The query parameters of the most recent entries request. */
function lastListParams() {
    const calls = vi.mocked(api.get).mock.calls.filter((call) => call[0] === '/api/contents');
    expect(calls.length, 'the entries list was never requested').toBeGreaterThan(0);
    return (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params;
}

beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    rows = [row('a', 'Alpha', ContentStatus.Published, 7)];

    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types') {
            return { data: { items: SCHEMAS, page: 1, pageSize: 20, totalItems: 1 } };
        }
        if (url === '/api/contents') {
            return { data: { items: rows, page: 1, pageSize: 20, totalItems: rows.length, totalPages: 1 } };
        }
        throw new Error(`unexpected GET ${url}`);
    });
});

function renderList() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <ContentListPage />
        </QueryClientProvider>,
    );
}

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('the entries filter bar', () => {
    it('sends what was typed to the server and shows back what the server answered', async () => {
        rows = [
            row('a', 'Alpha', ContentStatus.Published, 7),
            row('b', 'Beta', ContentStatus.Draft, 2),
            row('c', 'Gamma', ContentStatus.Archived, 1),
        ];

        renderList();
        await screen.findByText('Alpha');

        fireEvent.change(screen.getByRole('searchbox', { name: /search entries/i }), {
            target: { value: 'nothing on this page says this' },
        });

        await waitFor(() => expect(lastListParams().search).toBe('nothing on this page says this'));

        // Three rows, none of which match what was typed. A console filtering its own page would
        // be showing an empty table here.
        expect(bodyRows()).toHaveLength(3);
        expect(screen.getByText('Beta')).toBeTruthy();
    });

    it('asks the server for one status, and goes back to the first page when it changes', async () => {
        rows = [row('a', 'Alpha', ContentStatus.Published, 7), row('b', 'Beta', ContentStatus.Archived, 3)];

        renderList();
        await screen.findByText('Alpha');
        expect(lastListParams().status).toBeUndefined();

        fireEvent.click(screen.getByRole('radio', { name: 'Draft' }));

        await waitFor(() => expect(lastListParams().status).toBe(ContentStatus.Draft));
        expect(lastListParams().page).toBe(1);

        // Still both rows, neither of them a Draft. Which status a row has is the server's answer,
        // not something this screen checks after the fact.
        await waitFor(() => expect(bodyRows()).toHaveLength(2));
    });

    it('sends no status at all for All, rather than a word the server would have to ignore', async () => {
        renderList();
        await screen.findByText('Alpha');

        fireEvent.click(screen.getByRole('radio', { name: 'Draft' }));
        await waitFor(() => expect(lastListParams().status).toBe(ContentStatus.Draft));

        fireEvent.click(screen.getByRole('radio', { name: 'All' }));
        await waitFor(() => expect(lastListParams().status).toBeUndefined());
        expect(Object.keys(lastListParams())).not.toContain('all');
    });

    it('shows the version the server sent, and nothing at all when it sent none', async () => {
        rows = [
            row('a', 'Alpha', ContentStatus.Published, 7),
            // An older API sends no version at all.
            row('b', 'Beta', ContentStatus.Published),
            // A current one sends 0 for an entry with no event stream behind it, which is every
            // seeded row on a fresh deployment. That is the server saying it has no version, not
            // the entry being at version zero.
            row('c', 'Gamma', ContentStatus.Published, 0),
        ];

        renderList();
        await screen.findByText('Alpha');

        const cells = bodyRows();
        expect(cells).toHaveLength(3);
        expect(within(cells[0]).getByText('7')).toBeTruthy();
        expect(within(cells[1]).queryByText('0')).toBeNull();
        expect(within(cells[2]).queryByText('0')).toBeNull();
    });

    it('renders a status this console has never heard of as the server sent it', async () => {
        // An admin pointed at an API that grew a status. The list must not translate it into one of
        // the five it knows, and must not fall back to Draft.
        rows = [row('a', 'Alpha', 'Quarantined', 4)];

        renderList();

        expect(await screen.findByText('Quarantined')).toBeTruthy();
        // Scoped to the table: Draft is also a button in the filter bar, which is not a claim about
        // this row.
        expect(within(screen.getByRole('table')).queryByText('Draft')).toBeNull();
    });
});
