import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { FieldChange } from '@/hooks/use-field-changes';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api, tokenStore } = await import('@/lib/api');
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
        { entryId: 'entry c/3', reason: 'OverflowException', at: '2026-11-20T10:00:30Z' },
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
    const view = render(
        <QueryClientProvider client={client}>
            <FieldChangesPanel typeName={typeName} />
        </QueryClientProvider>,
    );
    return { ...view, client };
}

const RETRY = 'Retry Title recompute';

beforeEach(() => {
    vi.clearAllMocks();
    tokenStore.clear();
});

function tokenFor(tenant: string) {
    const encode = (value: object) => btoa(JSON.stringify(value));
    return `${encode({ alg: 'none' })}.${encode({ tenant })}.x`;
}

describe('the field changes panel', () => {
    it('shows a change that completed with skips, what was skipped and a Retry button', async () => {
        serve([SKIPPED]);
        renderPanel();

        expect(await screen.findByText('Completed with skips')).toBeTruthy();
        expect(screen.getByText('3 entries skipped')).toBeTruthy();
        for (const text of ['entry-aaa', 'entry-bbb', 'entry c/3']) {
            expect(screen.getByText(text)).toBeTruthy();
        }
        for (const text of ['InvalidOperationException', 'FormatException', 'OverflowException']) {
            expect(screen.getByText(text)).toBeTruthy();
        }
        expect(screen.getByText('entry-aaa').closest('a')?.getAttribute('href')).toBe('/content/entry-aaa');
        expect(screen.getByText('entry c/3').closest('a')?.getAttribute('href')).toBe('/content/entry%20c%2F3');
        expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
    });

    it('posts the retry once and reads the list again', async () => {
        serve([SKIPPED]);
        vi.mocked(api.post).mockResolvedValue({ data: change({ id: 'c2', state: 'running', retryOf: 'c-skips' }) });
        renderPanel();

        await userEvent.click(await screen.findByRole('button', { name: RETRY }));

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

        await userEvent.click(await screen.findByRole('button', { name: RETRY }));

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('This change was already retried.');
        expect(
            (screen.getByRole('button', { name: RETRY }) as HTMLButtonElement).disabled,
        ).toBe(false);
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('reads the list again after a refused retry, so a row that is stale is replaced', async () => {
        serve([SKIPPED]);
        vi.mocked(api.post).mockRejectedValue(refusal(409, { message: 'Already retried.' }));
        renderPanel();

        await userEvent.click(await screen.findByRole('button', { name: RETRY }));
        await screen.findByRole('alert');

        await waitFor(() => expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThanOrEqual(2));
    });

    it('encodes the change id in the retry path', async () => {
        serve([{ ...SKIPPED, id: 'c/1 x' }]);
        vi.mocked(api.post).mockResolvedValue({ data: change({ id: 'c2' }) });
        renderPanel();

        await userEvent.click(await screen.findByRole('button', { name: RETRY }));

        await waitFor(() => expect(api.post).toHaveBeenCalled());
        expect(api.post).toHaveBeenCalledWith('/api/content-types/field-changes/c%2F1%20x/retry');
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

    it('pages, answering by the page asked for', async () => {
        vi.mocked(api.get).mockImplementation((async (_url: string, config?: { params?: { page?: number } }) => {
            const page = config?.params?.page ?? 1;
            return {
                data: {
                    items: [change({ id: `p${page}`, field: `PageField${page}` })],
                    page,
                    pageSize: 20,
                    totalItems: 45,
                },
            };
        }) as typeof api.get);
        renderPanel();

        await screen.findByText('PageField1');
        await userEvent.click(screen.getByRole('button', { name: /Next/ }));

        expect(await screen.findByText('PageField2')).toBeTruthy();
        expect(screen.queryByText('PageField1')).toBeNull();
    });

    it('keeps the rows of the page on screen while the next one loads', async () => {
        let answerTwo: (value: unknown) => void = () => {};
        vi.mocked(api.get).mockImplementation((async (_url: string, config?: { params?: { page?: number } }) => {
            const page = config?.params?.page ?? 1;
            if (page === 2) {
                return new Promise((resolve) => {
                    answerTwo = resolve as (value: unknown) => void;
                });
            }
            return { data: { items: [change({ id: 'p1', field: 'PageField1' })], page: 1, pageSize: 20, totalItems: 45 } };
        }) as typeof api.get);
        renderPanel();

        await screen.findByText('PageField1');
        await userEvent.click(screen.getByRole('button', { name: /Next/ }));
        await waitFor(() => expect(vi.mocked(api.get).mock.calls.length).toBe(2));

        expect(screen.getByText('PageField1')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Next/ })).toBeTruthy();

        await act(async () =>
            answerTwo({
                data: { items: [change({ id: 'p2', field: 'PageField2' })], page: 2, pageSize: 20, totalItems: 45 },
            }),
        );
        expect(await screen.findByText('PageField2')).toBeTruthy();
        expect(screen.queryByText('PageField1')).toBeNull();
    });

    it('steps back when a later page comes back empty', async () => {
        vi.mocked(api.get).mockImplementation((async (_url: string, config?: { params?: { page?: number } }) => {
            const page = config?.params?.page ?? 1;
            if (page === 2) return { data: { items: [], page: 2, pageSize: 20, totalItems: 15 } };
            return { data: { items: [change({ id: 'p1', field: 'PageField1' })], page: 1, pageSize: 20, totalItems: 45 } };
        }) as typeof api.get);
        renderPanel();

        await screen.findByText('PageField1');
        await userEvent.click(screen.getByRole('button', { name: /Next/ }));

        await waitFor(() =>
            expect(vi.mocked(api.get).mock.calls.some(([, config]) => (config?.params as { page?: number } | undefined)?.page === 2)).toBe(true),
        );
        expect(await screen.findByText('PageField1')).toBeTruthy();
        expect(screen.queryByText('No field changes.')).toBeNull();
    });

    it('keeps the list and shows an alert above it when a later read fails', async () => {
        serve([change({ id: 'run', field: 'Price', state: 'running', processed: 4, total: 12 })]);
        const { client } = renderPanel();
        await screen.findByText('4 of 12');

        vi.mocked(api.get).mockRejectedValue(refusal(500, { message: 'The server fell over.' }));
        await act(async () => {
            await client.invalidateQueries();
        });

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('The server fell over.');
        expect(screen.getByText('4 of 12')).toBeTruthy();
    });

    it('shows an alert, and does not throw, when the list body has no items', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: {} });
        renderPanel();

        expect((await screen.findByRole('alert')).textContent).toContain('could not be listed');
        expect(screen.getByRole('heading', { name: 'Field changes' })).toBeTruthy();
    });

    it('reads the list every five seconds while a change is running, and stops once none is', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            serve([change({ id: 'run', state: 'running', processed: 1, total: 2 })]);
            renderPanel();
            await screen.findByText('1 of 2');
            expect(api.get).toHaveBeenCalledTimes(1);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000);
            });
            expect(api.get).toHaveBeenCalledTimes(2);

            serve([change({ id: 'run', state: 'completed', processed: 2, total: 2 })]);
            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000);
            });
            expect(api.get).toHaveBeenCalledTimes(3);
            await screen.findByText('Completed');

            await act(async () => {
                await vi.advanceTimersByTimeAsync(20000);
            });
            expect(api.get).toHaveBeenCalledTimes(3);
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not share cached changes between tenants that have a type of the same name', async () => {
        const list = (field: string) => ({
            data: { items: [change({ id: field, field })], page: 1, pageSize: 20, totalItems: 1 },
        });
        tokenStore.set(tokenFor('alpha'));
        vi.mocked(api.get).mockResolvedValueOnce(list('AlphaField'));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={client}>
                <FieldChangesPanel typeName="article" />
            </QueryClientProvider>,
        );
        expect(await screen.findByText('AlphaField')).toBeTruthy();

        let answer: (value: ReturnType<typeof list>) => void = () => {};
        vi.mocked(api.get).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)) as never);
        act(() => tokenStore.set(tokenFor('beta')));

        // Beta's answer has not arrived, and alpha's changes are not shown in its place.
        await waitFor(() => expect(screen.queryByText('AlphaField')).toBeNull());
        await act(async () => answer(list('BetaField')));
        expect(await screen.findByText('BetaField')).toBeTruthy();
        expect(api.get).toHaveBeenCalledTimes(2);
    });
});
