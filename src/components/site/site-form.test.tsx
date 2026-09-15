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

async function loadTheirsAfterConflict() {
    vi.mocked(api.put).mockRejectedValueOnce(httpError(412)).mockResolvedValueOnce({ data: { id: ID, version: 6 } });
    renderForm();
    fireEvent.click(await screen.findByRole('button', { name: 'Change a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Someone saved the site entry/)).toBeInTheDocument();
    detail = { data: { Name: 'Club', Colors: { a: '1', b: 'theirs' } }, version: 5 };
    fireEvent.click(screen.getByRole('button', { name: 'Load theirs under my changes' }));
    await waitFor(() => expect(screen.getByTestId('colors')).toHaveTextContent('theirs'));
}

const savedColors = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    return (vi.mocked(api.put).mock.calls[1][1] as { data: Record<string, unknown> }).data.Colors;
};

describe('SiteForm after someone else saved', () => {
    it('removes a key they added when I remove it after loading theirs', async () => {
        await loadTheirsAfterConflict();

        fireEvent.click(screen.getByRole('button', { name: 'Remove b' }));
        await waitFor(() => expect(screen.getByTestId('colors')).not.toHaveTextContent('theirs'));

        expect(await savedColors()).toEqual({ a: 'mine' });
    });

    it('does not count their value as mine when I edit the map again and they save once more', async () => {
        await loadTheirsAfterConflict();
        fireEvent.click(screen.getByRole('button', { name: 'Change a again' }));

        detail = { data: { Name: 'Club', Colors: { a: '1', b: 'third' } }, version: 6 };
        fireEvent.click(screen.getByRole('button', { name: 'Change a' }));
        await waitFor(() => expect(screen.getByTestId('colors')).toHaveTextContent('mine'));
        vi.mocked(api.put).mockReset().mockRejectedValueOnce(httpError(412)).mockResolvedValueOnce({ data: { id: ID, version: 7 } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(await screen.findByText(/Someone saved the site entry/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Load theirs under my changes' }));
        await waitFor(() => expect(screen.getByTestId('colors')).toHaveTextContent('third'));

        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
        const colors = (vi.mocked(api.put).mock.calls[1][1] as { data: Record<string, unknown> }).data.Colors;
        expect(colors).toEqual({ a: 'mine', b: 'third' });
    });

    it('keeps their new key in a map when my change to another key is loaded over theirs', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(httpError(412)).mockResolvedValueOnce({ data: { id: ID, version: 6 } });

        renderForm();
        fireEvent.click(await screen.findByRole('button', { name: 'Change a' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(await screen.findByText(/Someone saved the site entry/)).toBeInTheDocument();

        detail = { data: { Name: 'Club', Colors: { a: '1', b: 'theirs' } }, version: 5 };
        fireEvent.click(screen.getByRole('button', { name: 'Load theirs under my changes' }));
        await waitFor(() => expect(screen.getByTestId('colors')).toHaveTextContent('theirs'));

        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
        const [, body, config] = vi.mocked(api.put).mock.calls[1];
        expect((body as { data: Record<string, unknown> }).data.Colors).toEqual({ a: 'mine', b: 'theirs' });
        expect((body as { version: number }).version).toBe(5);
        expect(config).toEqual({ headers: { 'If-Match': '"5"' } });
    });
});
