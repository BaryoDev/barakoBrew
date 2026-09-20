import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QR') } }));

const { api } = await import('@/lib/api');
const { default: SecurityPage } = await import('./page');

const SETUP_SECRET = 'JBSWY3DPEHPK3PXP';
const CODES = ['aaaa-1111', 'bbbb-2222', 'cccc-3333'];

function holds(client: QueryClient, secret: string) {
    const has = (value: unknown) => JSON.stringify(value ?? null).includes(secret);
    return (
        client.getMutationCache().getAll().some((m) => has(m.state.data)) ||
        client.getQueryCache().getAll().some((q) => has(q.state.data))
    );
}

async function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(React.createElement(QueryClientProvider, { client }, React.createElement(SecurityPage)));
    // The Off badge means the status query has settled, which is what enables the setup button.
    await waitFor(() => expect(screen.getByText('Off')).toBeInTheDocument());
    return client;
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.get).mockResolvedValue({ data: { enabled: false } });
    vi.mocked(api.post).mockImplementation(async (url: string) => {
        if (url === '/api/auth/mfa/setup') {
            return { data: { secret: SETUP_SECRET, otpauthUri: `otpauth://totp/a?secret=${SETUP_SECRET}` } };
        }
        if (url === '/api/auth/mfa/enable') return { data: { message: 'on', recoveryCodes: CODES } };
        throw new Error(`unexpected post to ${url}`);
    });
});

describe('two-factor enrollment', () => {
    it('shows the setup key once and keeps it out of the caches', async () => {
        const client = await renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Set up two-factor' }));

        const field = await screen.findByTestId('mfa-setup-secret');
        expect(field).toHaveValue(SETUP_SECRET);
        expect(holds(client, SETUP_SECRET)).toBe(false);
    });

    it('drops the setup key from the screen and the caches when enrollment is cancelled', async () => {
        const client = await renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Set up two-factor' }));
        await screen.findByTestId('mfa-setup-secret');

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(screen.queryByTestId('mfa-setup-secret')).toBeNull());
        expect(document.body.textContent).not.toContain(SETUP_SECRET);
        expect(holds(client, SETUP_SECRET)).toBe(false);
    });

    it('shows the recovery codes once and keeps them out of the caches, before and after saving them', async () => {
        const client = await renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Set up two-factor' }));
        await screen.findByTestId('mfa-setup-secret');
        fireEvent.change(screen.getByLabelText('Enter the 6-digit code to confirm'), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));

        const list = await screen.findByTestId('mfa-recovery-codes');
        const items = Array.from(list.querySelectorAll('li'));
        expect(items).toHaveLength(CODES.length);
        expect(items.map((li) => li.textContent)).toEqual(CODES);
        expect(holds(client, CODES[0])).toBe(false);
        // The setup key went with the form that showed it.
        expect(document.body.textContent).not.toContain(SETUP_SECRET);
        expect(holds(client, SETUP_SECRET)).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: "I've saved them" }));

        await waitFor(() => expect(screen.queryByTestId('mfa-recovery-codes')).toBeNull());
        CODES.forEach((code) => expect(document.body.textContent).not.toContain(code));
        expect(holds(client, CODES[0])).toBe(false);
    });
});
