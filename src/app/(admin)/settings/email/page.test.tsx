import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * GET /api/settings/email takes manage_settings; PUT and the test send take manage_email_settings.
 * A role with the first and not the second can read the screen and is not offered the buttons.
 */
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: { userId: 'u1', username: 'o', roles: ['Operator'] } }),
}));

const { api } = await import('@/lib/api');
const { default: EmailSettingsPage } = await import('./page');

const SETTINGS = {
    apiKeySet: true,
    apiKeySource: 'Stored',
    fromAddress: 'no-reply@example.com',
    fromAddressSource: 'Stored',
    providerRegistered: true,
};

function renderPage(capabilities: string[]) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/me') {
            return {
                data: { userId: 'u1', username: 'o', tenant: 'default', roles: [{ id: 'r-3', name: 'Operator' }], capabilities },
            };
        }
        if (url === '/api/settings/email') return { data: SETTINGS };
        throw new Error(`unexpected GET ${url}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <EmailSettingsPage />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('the email settings screen', () => {
    it('reads for manage_settings, and holds Save and the test send without manage_email_settings', async () => {
        renderPage(['manage_settings']);

        const save = await screen.findByRole('button', { name: 'Save' });
        await waitFor(() => expect(screen.getByText(/need the Manage email settings capability/)).toBeInTheDocument());
        expect(save).toBeDisabled();
        expect(screen.getByRole('button', { name: /send a test/i })).toBeDisabled();
    });

    it('offers both to a role holding manage_email_settings', async () => {
        renderPage(['manage_settings', 'manage_email_settings']);

        const save = await screen.findByRole('button', { name: 'Save' });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
        await waitFor(() => expect(save).toBeEnabled());
        expect(screen.getByRole('button', { name: /send a test/i })).toBeEnabled();
    });
});
