import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { FieldChange } from '@/hooks/use-field-changes';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api } = await import('@/lib/api');
const { toast } = await import('sonner');
const { FieldChangesPanel } = await import('./field-changes-panel');

function change(overrides: Partial<FieldChange> = {}): FieldChange {
    return {
        id: 'c1',
        contentType: 'article',
        field: 'Title',
        kind: 'recompute',
        state: 'completed',
        step: 1,
        steps: 1,
        processed: 10,
        total: 10,
        valuesLost: 0,
        error: null,
        startedAt: '2026-11-20T10:00:00Z',
        completedAt: '2026-11-20T10:01:00Z',
        abandonedAt: null,
        abandonedBy: null,
        skippedCount: null,
        skipped: null,
        retryOf: null,
        retriedBy: null,
        ...overrides,
    };
}

const SKIPPED = change({
    id: 'c-skips',
    state: 'completed_with_skips',
    processed: 7,
    total: 10,
    skippedCount: 3,
    skipped: [
        { entryId: 'entry-aaa', reason: 'InvalidOperationException', at: '2026-11-20T10:00:10Z' },
        { entryId: 'entry-bbb', reason: 'FormatException', at: '2026-11-20T10:00:20Z' },
        { entryId: 'entry-ccc', reason: 'OverflowException', at: '2026-11-20T10:00:30Z' },
    ],
});

let items: FieldChange[];

function serve(list: FieldChange[], totalItems = list.length) {
    items = list;
    vi.mocked(api.get).mockImplementation(async () => ({
        data: { items, page: 1, pageSize: 20, totalItems },
    }));
}

function refusal(status: number, data: unknown = {}) {
    return new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        statusText: '',
        headers: {},
        config: {} as never,
        data,
    });
}

function renderPanel(typeName = 'article') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <FieldChangesPanel typeName={typeName} />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('the field changes panel', () => {
    it('shows a change that completed with skips, what was skipped and a Retry button', async () => {
        serve([SKIPPED]);
        renderPanel();

        expect(await screen.findByText('Completed with skips')).toBeTruthy();
        expect(screen.getByText('3 entries skipped')).toBeTruthy();
        for (const text of ['entry-aaa', 'entry-bbb', 'entry-ccc']) {
            expect(screen.getByText(text)).toBeTruthy();
        }
        for (const text of ['InvalidOperationException', 'FormatException', 'OverflowException']) {
            expect(screen.getByText(text)).toBeTruthy();
        }
        expect(screen.getByText('entry-aaa').closest('a')?.getAttribute('href')).toBe('/content/entry-aaa');
        expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    });

    it('posts the retry once and reads the list again', async () => {
        serve([SKIPPED]);
        vi.mocked(api.post).mockResolvedValue({ data: change({ id: 'c2', state: 'running', retryOf: 'c-skips' }) });
        renderPanel();

        await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(api.post).toHaveBeenCalledWith('/api/content-types/field-changes/c-skips/retry');
        await waitFor(() => expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThanOrEqual(2));
    });

    it('shows the API message beside the button when the retry is refused, and the button works again', async () => {
        serve([SKIPPED]);
        vi.mocked(api.post).mockRejectedValue(
            refusal(409, { message: 'This change was already retried.' }),
        );
        renderPanel();

        await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('This change was already retried.');
        expect(
            (screen.getByRole('button', { name: 'Retry' }) as HTMLButtonElement).disabled,
        ).toBe(false);
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('offers no Retry for a change already retried or one that completed cleanly', async () => {
        serve([
            change({ id: 'done', field: 'Slug' }),
            { ...SKIPPED, retriedBy: 'c-next' },
            change({ id: 'next', field: 'Title', retryOf: 'c-skips' }),
        ]);
        renderPanel();

        expect(await screen.findByText('Retried')).toBeTruthy();
        expect(screen.getByText('Retry of an earlier change')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
        expect(screen.queryByText('c-next')).toBeNull();
    });

    it('says how many recorded skips are not listed', async () => {
        serve([{ ...SKIPPED, skippedCount: 150, skipped: Array.from({ length: 100 }, (_, i) => ({
            entryId: `entry-${i}`,
            reason: 'InvalidOperationException',
            at: '2026-11-20T10:00:10Z',
        })) }]);
        renderPanel();

        expect(await screen.findByText('150 entries skipped')).toBeTruthy();
        expect(screen.getByText(/and 50 more not listed; a retry makes a full pass/)).toBeTruthy();
    });

    it('draws nothing when the list answers 404', async () => {
        vi.mocked(api.get).mockRejectedValue(refusal(404));
        renderPanel();

        await waitFor(() => expect(api.get).toHaveBeenCalled());
        await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
        expect(screen.queryByRole('heading', { name: 'Field changes' })).toBeNull();
    });

    it('draws nothing when the list answers 403', async () => {
        vi.mocked(api.get).mockRejectedValue(refusal(403));
        renderPanel();

        await waitFor(() => expect(api.get).toHaveBeenCalled());
        await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
        expect(screen.queryByRole('heading', { name: 'Field changes' })).toBeNull();
    });

    it('encodes the type name in the path', async () => {
        serve([]);
        renderPanel('my type/x');

        expect(await screen.findByRole('heading', { name: 'Field changes' })).toBeTruthy();
        expect(vi.mocked(api.get).mock.calls[0][0]).toBe('/api/content-types/my%20type%2Fx/field-changes');
    });

    it('draws a reason as text', async () => {
        serve([
            {
                ...SKIPPED,
                skippedCount: 1,
                skipped: [{ entryId: 'entry-aaa', reason: '<img src=x onerror=alert(1)>', at: '2026-11-20T10:00:10Z' }],
            },
        ]);
        const { container } = renderPanel();

        expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy();
        expect(container.querySelector('img')).toBeNull();
    });

    it('shows a running change with its progress and a completed one with its badge', async () => {
        serve([
            change({ id: 'run', field: 'Price', state: 'running', processed: 4, total: 12 }),
            change({ id: 'done', field: 'Slug', state: 'completed' }),
        ]);
        renderPanel();

        expect(await screen.findByText('Running')).toBeTruthy();
        expect(screen.getByText('4 of 12')).toBeTruthy();
        expect(screen.getByText('Completed')).toBeTruthy();
        expect(screen.getByText('10 of 10')).toBeTruthy();
    });

    it('shows an error under its change, as text', async () => {
        serve([change({ state: 'abandoned', error: 'The recompute was stopped.' })]);
        renderPanel();

        expect(await screen.findByText('The recompute was stopped.')).toBeTruthy();
        expect(screen.getByText('Abandoned')).toBeTruthy();
    });

    it('pages when there are more changes than fit on a page', async () => {
        serve([change()], 45);
        renderPanel();

        await screen.findByText('Completed');
        expect((screen.getByRole('button', { name: /Next/ }) as HTMLButtonElement).disabled).toBe(false);
        await userEvent.click(screen.getByRole('button', { name: /Next/ }));
        await waitFor(() =>
            expect(vi.mocked(api.get).mock.calls.some(([, config]) => (config?.params as { page?: number } | undefined)?.page === 2)).toBe(true),
        );
    });
});
