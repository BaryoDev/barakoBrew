import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StorageSettings } from '@/types/storage-settings';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: { userId: 'u1', username: 'a', roles: ['Admin'] } }),
}));

const { api } = await import('@/lib/api');
const { default: StorageSettingsPage } = await import('./page');

const BASE: StorageSettings = {
    provider: 'postgres',
    s3: null,
    activeProvider: 'postgres',
    readOnly: false,
    environmentKeys: [],
    availableProviders: ['postgres', 's3'],
};

const STORED_S3: StorageSettings = {
    ...BASE,
    provider: 's3',
    activeProvider: 's3',
    s3: {
        bucket: 'media',
        region: 'eu-west-1',
        serviceUrl: null,
        publicBaseUrl: null,
        usePublicReadAcl: false,
        forcePathStyle: true,
        accessKey: 'AKIA1',
        secretSet: true,
    },
};

function renderPage(settings: StorageSettings) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/api/me') {
            return {
                data: {
                    userId: 'u1',
                    username: 'a',
                    tenant: 'default',
                    roles: [{ id: 'r-2', name: 'Admin' }],
                    capabilities: ['manage_storage'],
                },
            };
        }
        if (url === '/api/settings/storage') return { data: settings };
        throw new Error(`unexpected GET ${url}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <StorageSettingsPage />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('the storage settings screen', () => {
    it('never fills the secret box from the API and shows Secret set with Replace instead', async () => {
        renderPage(STORED_S3);

        expect(await screen.findByText('Secret set')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Secret key')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Replace' }));
        const box = screen.getByLabelText('Secret key');
        expect(box).toHaveAttribute('type', 'password');
        expect(box).toHaveValue('');
    });

    it('keeps Save disabled until a test passes for the values on the form, and clears the pass on an edit', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { ok: true, message: 'Wrote, read and deleted an object.' } });
        renderPage(STORED_S3);
        const user = userEvent.setup();

        const save = await screen.findByRole('button', { name: 'Save' });
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me'));
        expect(save).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Test connection' }));
        await waitFor(() => expect(save).toBeEnabled());
        expect(api.post).toHaveBeenCalledWith(
            '/api/settings/storage/test',
            expect.objectContaining({
                provider: 's3',
                s3: expect.objectContaining({ bucket: 'media', secretKey: null }),
            }),
        );

        await user.type(screen.getByLabelText('Bucket'), 'x');
        expect(save).toBeDisabled();
    });

    it('names the failed step and the provider error code when a test fails', async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { ok: false, step: 'put', errorCode: 'NoSuchBucket', message: 'The bucket does not exist.' },
        });
        renderPage(STORED_S3);

        await userEvent.click(await screen.findByRole('button', { name: 'Test connection' }));

        const result = await screen.findByTestId('storage-test-result');
        expect(within(result).getByText('put')).toBeInTheDocument();
        expect(within(result).getByText('NoSuchBucket')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('is read-only and names the keys when configuration sets storage', async () => {
        renderPage({ ...STORED_S3, readOnly: true, environmentKeys: ['Bucket', 'Region'] });

        const notice = await screen.findByTestId('storage-read-only');
        expect(within(notice).getByText('FILES__S3__BUCKET')).toBeInTheDocument();
        expect(within(notice).getByText('FILES__S3__REGION')).toBeInTheDocument();
        expect(screen.getByLabelText('Bucket')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('lets the database be saved without a test', async () => {
        renderPage(BASE);

        const save = await screen.findByRole('button', { name: 'Save' });
        await waitFor(() => expect(save).toBeEnabled());
        expect(screen.queryByRole('button', { name: 'Test connection' })).not.toBeInTheDocument();
    });
});
