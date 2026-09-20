import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api } = await import('@/lib/api');
const { SiteForm } = await import('./site-form');

const ID = '0b7c1f0e-6d7a-4f3e-9a51-0d1c2b3a4f50';

function httpError(status: number) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data: {},
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

let detail: { data: Record<string, unknown>; version: number };

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
    detail = { data: { Name: 'Club', Colors: { a: '1' } }, version: 4 };

    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/content-types') {
            return { data: { items: [{ name: 'site', displayName: 'Site', isSingleton: true, fields: [] }] } };
        }
        if (url === '/api/contents') return { data: { items: [{ id: ID }], totalItems: 1, page: 1, pageSize: 2 } };
        if (url === `/api/contents/${ID}`) {
            return {
                data: { id: ID, contentType: 'site', data: detail.data, status: 'Published', version: detail.version },
                headers: { etag: `"${detail.version}"` },
            };
        }
        throw httpError(404);
    });
});

function renderForm() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <SiteForm title="Theme" description="Colours">
                {({ values, set }) => (
                    <>
                        <output data-testid="colors">{JSON.stringify(values.Colors)}</output>
                        <button type="button" onClick={() => set('Colors', { ...(values.Colors as object), a: 'mine' })}>
                            Change a
                        </button>
                        <button type="button" onClick={() => set('Colors', { ...(values.Colors as object), a: 'mine again' })}>
                            Change a again
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const { b: _removed, ...rest } = values.Colors as Record<string, unknown>;
                                void _removed;
                                set('Colors', rest);
                            }}
                        >
                            Remove b
                        </button>
                    </>
                )}
            </SiteForm>
        </QueryClientProvider>,
    );
}

/** What the second write sent, which is the one the shared flow rebased. */
function secondWrite() {
    const [, body, config] = vi.mocked(api.put).mock.calls[1];
    return { body: body as { data: Record<string, unknown>; version: number }, config };
}

describe('SiteForm when someone else saved first', () => {
    it('moves an unrelated change onto their version and saves it, without asking', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(httpError(412)).mockResolvedValueOnce({ data: { id: ID, version: 6 } });

        renderForm();
        fireEvent.click(await screen.findByRole('button', { name: 'Change a' }));

        // They add a key this screen never touched, between the read and the save.
        detail = { data: { Name: 'Club', Colors: { a: '1', b: 'theirs' } }, version: 5 };
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
        const { body, config } = secondWrite();
        expect(body.data.Colors).toEqual({ a: 'mine', b: 'theirs' });
        // Written against what they stored, not against the version this screen first read.
        expect(body.version).toBe(5);
        expect(config).toEqual({ headers: { 'If-Match': '"5"' } });
        expect(screen.queryByText(/while you were editing/)).toBeNull();
    });

    it('keeps their change to a key this screen removed another key from', async () => {
        detail = { data: { Name: 'Club', Colors: { a: '1', b: '2' } }, version: 4 };
        vi.mocked(api.put).mockRejectedValueOnce(httpError(412)).mockResolvedValueOnce({ data: { id: ID, version: 6 } });

        renderForm();
        fireEvent.click(await screen.findByRole('button', { name: 'Remove b' }));

        detail = { data: { Name: 'Club', Colors: { a: 'theirs', b: '2' } }, version: 5 };
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
        expect(secondWrite().body.data.Colors).toEqual({ a: 'theirs' });
    });

    it('refuses to write over a key they changed too, and names it', async () => {
        // A second write here would be the silent overwrite this flow exists to stop, so the mock
        // would let one through: the test fails loudly if the flow ever retries this.
        vi.mocked(api.put).mockRejectedValueOnce(httpError(412)).mockResolvedValue({ data: { id: ID, version: 6 } });

        renderForm();
        fireEvent.click(await screen.findByRole('button', { name: 'Change a' }));

        detail = { data: { Name: 'Club', Colors: { a: 'theirs' } }, version: 5 };
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

        expect(await screen.findByText(/Colors\.a/)).toBeInTheDocument();
        expect(api.put).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('colors')).toHaveTextContent('mine');
    });

    it('takes their version under my changes, keeping the key they added', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(httpError(412)).mockResolvedValue({ data: { id: ID, version: 6 } });

        renderForm();
        fireEvent.click(await screen.findByRole('button', { name: 'Change a' }));

        detail = { data: { Name: 'Club', Colors: { a: 'theirs', b: 'new' } }, version: 5 };
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(await screen.findByText(/Colors\.a/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Load theirs under my changes' }));
        await waitFor(() => expect(screen.getByTestId('colors')).toHaveTextContent('new'));

        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
        const { body, config } = secondWrite();
        expect(body.data.Colors).toEqual({ a: 'mine', b: 'new' });
        expect(body.version).toBe(5);
        expect(config).toEqual({ headers: { 'If-Match': '"5"' } });
    });
});
