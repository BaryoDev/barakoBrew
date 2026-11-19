import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const access = { can: vi.fn(() => true), known: true, viewer: { roles: [] as string[] } };
vi.mock('@/hooks/use-access', () => ({ useAccess: () => access }));
vi.mock('@/hooks/use-tenants', () => ({ useCurrentTenant: () => 'acme' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const toDataURL = vi.fn(async (text: string) => (void text, 'data:image/png;base64,AAAA'));
vi.mock('qrcode', () => ({ default: { toDataURL: (text: string) => toDataURL(text) } }));

globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { api } = await import('@/lib/api');
const { MODULES_KEY } = await import('@/hooks/use-modules');
const { ConnectPhone } = await import('./connect-phone');

const T0 = new Date('2026-11-18T10:00:00Z').getTime();
const LINK = 'app://connect?v=2&url=https%3A%2F%2Fcms.example.com&tenant=acme&name=Acme&code=SERVERCODE12&exp=1';

const started = (extra: Record<string, unknown> = {}, ms = 120_000) => ({
    data: {
        id: 'p1',
        instanceUrl: 'https://cms.example.com',
        tenant: 'acme',
        instanceName: 'Acme',
        code: 'SERVERCODE12',
        expiresAt: new Date(T0 + ms).toISOString(),
        expiresInSeconds: ms / 1000,
        link: LINK,
        warning: null,
        ...extra,
    },
});

type Row = { name: string; createdAt?: string; revoked?: boolean };
const listOf = (rows: (string | Row)[]) => {
    const items = rows.map((r, i) => {
        const row = typeof r === 'string' ? { name: r } : r;
        return {
            id: `k${i}`, prefix: 'bcms_ro', scopes: ['content:read'], tenantSlug: 'acme', revoked: false,
            createdAt: new Date(T0 + 1_000).toISOString(), ...row,
        };
    });
    return { data: { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: 1, hasNextPage: false } };
};

function mount(modules: unknown = { kind: 'modules', modules: [{ name: 'ApiKeyPairing', enabled: true }] }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // The module list is read once and kept, so it is seeded the way a read would leave it.
    if (modules) client.setQueryData(MODULES_KEY, modules);
    render(React.createElement(QueryClientProvider, { client }, React.createElement(ConnectPhone)));
    return { client };
}

const notFound = () =>
    Object.assign(new Error('404'), { isAxiosError: true, response: { status: 404, data: '', headers: {} } });

const SOURCES = [
    { id: 'health', label: 'Health checks', on: true, allowed: true },
    { id: 'traffic', label: 'Traffic', on: true, allowed: true },
    { id: 'errors', label: 'Error log', on: true, allowed: false },
    { id: 'digest', label: 'Weekly digest', on: false, allowed: true },
];

/** Serves the sources route with a list, and the key list as before. */
const withSources = (sources = SOURCES) =>
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/api-keys') return listOf(['CI deploy']);
        if (url === '/api/api-keys/pairings/sources') return { data: { sources } };
        throw new Error(`unexpected GET ${url}`);
    });

const showQr = async () => {
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Show QR' }));
    });
    await flush();
};

const keyReads = () => vi.mocked(api.get).mock.calls.filter((c) => c[0] === '/api/api-keys').length;
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

async function openDialog() {
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Connect a phone' }));
    });
    await flush();
}

async function openAndShow() {
    await openDialog();
    await showQr();
}

describe('Connect a phone', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
        access.can.mockReturnValue(true);
        vi.mocked(api.post).mockReset();
        vi.mocked(api.get).mockReset();
        toDataURL.mockClear();
        vi.mocked(api.post).mockResolvedValue(started());
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/api-keys') return listOf(['CI deploy']);
            if (url === '/api/api-keys/pairings/sources') throw notFound();
            throw new Error(`unexpected GET ${url}`);
        });
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('hides the button without permission to create keys', () => {
        access.can.mockReturnValue(false);
        mount();
        expect(screen.queryByRole('button', { name: 'Connect a phone' })).toBeNull();
    });

    it('hides the button when the module is not listed or not enabled', () => {
        mount({ kind: 'modules', modules: [{ name: 'Other', enabled: true }, { name: 'ApiKeyPairing', enabled: false }] });
        expect(screen.queryByRole('button', { name: 'Connect a phone' })).toBeNull();
    });

    it('hides the button when the module list cannot be read', () => {
        mount({ kind: 'unreadable' });
        expect(screen.queryByRole('button', { name: 'Connect a phone' })).toBeNull();
    });

    it('makes no code on opening, and one code when Show QR is pressed twice quickly', async () => {
        mount();
        await openDialog();
        expect(api.post).not.toHaveBeenCalled();
        const button = screen.getByRole('button', { name: 'Show QR' });
        await act(async () => {
            fireEvent.click(button);
            fireEvent.click(button);
        });
        await flush();
        expect(api.post).toHaveBeenCalledTimes(1);
    });

    it('opens on the choice step with a generated name, a box per source and no QR', async () => {
        withSources();
        mount();
        await openDialog();
        expect(api.post).not.toHaveBeenCalled();
        expect((screen.getByLabelText('Name') as HTMLInputElement).value).toMatch(/^Phone \d\d:\d\d:\d\d$/);
        expect(screen.getByText('What can this phone see?')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Health checks' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Traffic' })).toBeChecked();
        expect(screen.queryByAltText('QR code to connect a phone')).toBeNull();
    });

    it('shows a source the caller may not tick as unticked and disabled, with a hint', async () => {
        withSources();
        mount();
        await openDialog();
        const box = screen.getByRole('checkbox', { name: 'Error log' });
        expect(box).not.toBeChecked();
        expect(box).toBeDisabled();
        expect(screen.getByText('Your sign-in cannot see this.')).toBeInTheDocument();
        // Off by default but allowed: unticked and free to tick.
        const digest = screen.getByRole('checkbox', { name: 'Weekly digest' });
        expect(digest).not.toBeChecked();
        expect(digest).not.toBeDisabled();
        await showQr();
        const body = vi.mocked(api.post).mock.calls[0][1] as { sources: string[] };
        expect(body.sources).toEqual(['health', 'traffic']);
    });

    it('says what the phone sees when nothing is ticked, and posts an empty list', async () => {
        withSources();
        mount();
        await openDialog();
        const hint = 'Nothing ticked. The phone will only see which modules the site runs.';
        expect(screen.queryByText(hint)).toBeNull();
        for (const name of ['Health checks', 'Traffic']) {
            await act(async () => {
                fireEvent.click(screen.getByRole('checkbox', { name }));
            });
        }
        expect(screen.getByText(hint)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Show QR' })).toBeEnabled();
        await showQr();
        expect((vi.mocked(api.post).mock.calls[0][1] as { sources: string[] }).sources).toEqual([]);
    });

    it('keeps the boxes when the window regains focus and the sources route has since failed', async () => {
        withSources();
        mount();
        await openDialog();
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/api-keys') return listOf(['CI deploy']);
            throw notFound();
        });
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('focus'));
        });
        await flush();
        expect(screen.getByRole('checkbox', { name: 'Health checks' })).toBeInTheDocument();
        expect(screen.queryByText('Could not load what this phone can see.')).toBeNull();
    });

    it('posts the name and the ticked ids in list order after Traffic is unticked', async () => {
        withSources([...SOURCES.slice(0, 2), { id: 'jobs', label: 'Jobs', on: true, allowed: true }]);
        mount();
        await openDialog();
        await act(async () => {
            fireEvent.click(screen.getByRole('checkbox', { name: 'Traffic' }));
        });
        await showQr();
        const [url, body] = vi.mocked(api.post).mock.calls[0] as [string, { name: string; sources: string[] }];
        expect(url).toBe('/api/api-keys/pairings');
        expect(body.name).toMatch(/^Phone \d\d:\d\d:\d\d$/);
        expect(body.sources).toEqual(['health', 'jobs']);
    });

    it('shows an error and Try again when the sources route fails, makes no code, and recovers', async () => {
        const fail = Object.assign(new Error('500'), { isAxiosError: true, response: { status: 500, data: '', headers: {} } });
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/api-keys') return listOf(['CI deploy']);
            if (url === '/api/api-keys/pairings/sources') throw fail;
            throw new Error(`unexpected GET ${url}`);
        });
        mount();
        await openDialog();
        expect(screen.getByText('Could not load what this phone can see.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Show QR' })).toBeNull();
        expect(api.post).not.toHaveBeenCalled();
        withSources();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        });
        await flush();
        expect(screen.getByRole('checkbox', { name: 'Health checks' })).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('posts only the name when the sources route answers 404', async () => {
        mount();
        await openDialog();
        expect(screen.getByLabelText('Name')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).toBeNull();
        await showQr();
        const body = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>;
        expect(Object.keys(body)).toEqual(['name']);
    });

    it('sends the generated name for a blank name, and the connected poll matches it', async () => {
        mount();
        await openDialog();
        await act(async () => {
            fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
        });
        await showQr();
        const name = (vi.mocked(api.post).mock.calls[0][1] as { name: string }).name;
        expect(name).toMatch(/^Phone \d\d:\d\d:\d\d$/);
        vi.mocked(api.get).mockImplementation(async () => listOf([name]));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3_000);
        });
        expect(screen.getByText('Phone connected')).toBeInTheDocument();
    });

    it('sends a typed name trimmed', async () => {
        mount();
        await openDialog();
        await act(async () => {
            fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Arnel phone ' } });
        });
        await showQr();
        expect((vi.mocked(api.post).mock.calls[0][1] as { name: string }).name).toBe('Arnel phone');
    });

    it('shows a 400 message from the server and offers New code and a way back', async () => {
        withSources();
        vi.mocked(api.post).mockRejectedValue(
            Object.assign(new Error('400'), {
                isAxiosError: true,
                response: { status: 400, data: { message: 'That choice is not allowed.' }, headers: {} },
            }),
        );
        mount();
        await openDialog();
        await showQr();
        expect(screen.getAllByText('That choice is not allowed.').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'Change choices' })).toBeInTheDocument();
    });

    it('sends a name with the local time and draws the server link as the QR, without showing the code', async () => {
        mount();
        await openAndShow();
        const [url, body] = vi.mocked(api.post).mock.calls[0] as [string, { name: string }];
        expect(url).toBe('/api/api-keys/pairings');
        expect(body.name).toMatch(/^Phone \d\d:\d\d:\d\d$/);
        expect(toDataURL).toHaveBeenCalledWith(LINK);
        expect(screen.getByAltText('QR code to connect a phone')).toBeInTheDocument();
        expect(document.body.textContent).not.toContain('SERVERCODE12');
        expect(screen.getByTestId('pairing-countdown')).toHaveTextContent('2:00');
    });

    it('shows the warning as text under the QR', async () => {
        vi.mocked(api.post).mockResolvedValue(started({ warning: 'This instance is reachable only on your network.' }));
        mount();
        await openAndShow();
        expect(screen.getByText('This instance is reachable only on your network.')).toBeInTheDocument();
    });

    it('shows the https message and no QR when the instance url is http and not local', async () => {
        vi.mocked(api.post).mockResolvedValue(started({ instanceUrl: 'http://cms.example.com' }));
        mount();
        await openAndShow();
        expect(screen.getByText('A phone can only connect over https. This address is not https.')).toBeInTheDocument();
        expect(screen.queryByAltText('QR code to connect a phone')).toBeNull();
        expect(toDataURL).not.toHaveBeenCalled();
    });

    it('says to wait on a 429', async () => {
        vi.mocked(api.post).mockRejectedValue(
            Object.assign(new Error('429'), { isAxiosError: true, response: { status: 429, data: '', headers: {} } }),
        );
        mount();
        await openAndShow();
        expect(screen.getAllByText('Too many codes. Wait a minute and try again.').length).toBeGreaterThan(0);
        expect(screen.queryByAltText('QR code to connect a phone')).toBeNull();
    });

    it('shows the expired state and stops reading the list five seconds after expiry', async () => {
        vi.mocked(api.post).mockResolvedValue(started({}, 10_000));
        mount();
        await openAndShow();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(11_000);
        });
        expect(screen.getByText('Code expired')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New code' })).toBeInTheDocument();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4_000);
        });
        const reads = keyReads();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(20_000);
        });
        expect(keyReads()).toBe(reads);
    });

    it('shows connected for a key that appears three seconds after expiry', async () => {
        vi.mocked(api.post).mockResolvedValue(started({}, 10_000));
        mount();
        await openAndShow();
        const name = (vi.mocked(api.post).mock.calls[0][1] as { name: string }).name;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_500);
        });
        expect(screen.getByText('Code expired')).toBeInTheDocument();
        vi.mocked(api.get).mockImplementation(async () => listOf(['CI deploy', name]));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3_000);
        });
        expect(screen.getByText('Phone connected')).toBeInTheDocument();
        expect(screen.queryByText('Code expired')).toBeNull();
    });

    it.each([
        ['ahead', 3 * 60_000],
        ['behind', -3 * 60_000],
    ])('counts down from receipt when the server clock is 3 minutes %s', async (_label, skew) => {
        // The server says it made the code at T0 + skew. This browser's clock says T0.
        vi.mocked(api.post).mockResolvedValue(started({ expiresAt: new Date(T0 + skew + 120_000).toISOString() }));
        mount();
        await openAndShow();
        expect(screen.queryByText('Code expired')).toBeNull();
        expect(screen.getByTestId('pairing-countdown')).toHaveTextContent('2:00');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(61_000);
        });
        expect(screen.getByTestId('pairing-countdown')).toHaveTextContent('0:59');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });
        expect(screen.getByText('Code expired')).toBeInTheDocument();
    });

    it('does not count a same-name key made before the pairing', async () => {
        mount();
        await openAndShow();
        const name = (vi.mocked(api.post).mock.calls[0][1] as { name: string }).name;
        vi.mocked(api.get).mockImplementation(async () =>
            listOf([{ name, createdAt: new Date(T0 - 60_000).toISOString() }]),
        );
        await act(async () => {
            await vi.advanceTimersByTimeAsync(6_000);
        });
        expect(screen.queryByText('Phone connected')).toBeNull();
        expect(screen.getByAltText('QR code to connect a phone')).toBeInTheDocument();
    });

    it('does not count a revoked same-name key', async () => {
        mount();
        await openAndShow();
        const name = (vi.mocked(api.post).mock.calls[0][1] as { name: string }).name;
        vi.mocked(api.get).mockImplementation(async () => listOf([{ name, revoked: true }]));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(6_000);
        });
        expect(screen.queryByText('Phone connected')).toBeNull();
    });

    it('asks for a new code from the expired state, with the same name and sources', async () => {
        withSources();
        vi.mocked(api.post).mockResolvedValueOnce(started({}, 5_000));
        mount();
        await openAndShow();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(6_000);
        });
        vi.mocked(api.post).mockResolvedValueOnce(started({ id: 'p2', link: 'app://connect?v=2&code=NEW' }, 126_000));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'New code' }));
        });
        await flush();
        expect(api.post).toHaveBeenCalledTimes(2);
        expect(vi.mocked(api.post).mock.calls[1][1]).toEqual(vi.mocked(api.post).mock.calls[0][1]);
        expect(toDataURL).toHaveBeenLastCalledWith('app://connect?v=2&code=NEW');
        expect(screen.getByAltText('QR code to connect a phone')).toBeInTheDocument();
    });

    it('reads the key list every three seconds and shows connected when the named row appears', async () => {
        mount();
        await openAndShow();
        const name = (vi.mocked(api.post).mock.calls[0][1] as { name: string }).name;
        const before = keyReads();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3_000);
        });
        expect(keyReads()).toBe(before + 1);
        expect(screen.getByAltText('QR code to connect a phone')).toBeInTheDocument();

        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === '/api/api-keys') return listOf(['CI deploy', name]);
            throw new Error(`unexpected GET ${url}`);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3_000);
        });
        expect(screen.getByText('Phone connected')).toBeInTheDocument();
        expect(screen.queryByAltText('QR code to connect a phone')).toBeNull();
        const reads = keyReads();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(12_000);
        });
        expect(keyReads()).toBe(reads);
    });

    it('stops reading the list after the dialog closes', async () => {
        mount();
        await openAndShow();
        await act(async () => {
            // The footer button, not the dialog's x, which has the same name.
            fireEvent.click(screen.getByText('Close', { selector: 'button' }));
        });
        await flush();
        const reads = keyReads();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(12_000);
        });
        expect(keyReads()).toBe(reads);
    });
});
