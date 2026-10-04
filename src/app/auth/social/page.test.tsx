import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { post: vi.fn(), get: vi.fn() } };
});

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

const { api, tokenStore } = await import('@/lib/api');
const { default: SocialCallbackPage } = await import('./page');

// Payload {"tenant":"north"}, so the exchange carries that tenant.
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnQiOiJub3J0aCJ9.c2ln';

function arriveWith(hash: string) {
    window.history.replaceState(null, '', `/auth/social${hash}`);
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
            <SocialCallbackPage />
        </QueryClientProvider>,
    );
}

let post: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    replace.mockReset();
    vi.mocked(api.post).mockReset();
    post = vi.spyOn(axios, 'post');
    tokenStore.clear();
});

afterEach(() => {
    post.mockRestore();
    window.history.replaceState(null, '', '/');
});

describe('the external sign-in callback', () => {
    it('spends the refresh token once for a session, clears the fragment and goes in', async () => {
        post.mockResolvedValue({ data: { token: 'fresh-access-token' } });

        arriveWith(`#token=${JWT}&refresh=one-time-refresh&club=north`);

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
        expect(window.location.hash).toBe('');
        expect(window.location.href).not.toContain('one-time-refresh');
        expect(post).toHaveBeenCalledTimes(1);
        const [url, body, config] = post.mock.calls[0] as [string, unknown, { headers?: Record<string, string> }];
        expect(url).toMatch(/\/api\/auth\/refresh$/);
        expect(body).toEqual({ refreshToken: 'one-time-refresh' });
        expect(config.headers?.['X-Tenant']).toBe('north');
        expect(tokenStore.token).toBe('fresh-access-token');
    });

    it('asks for the second factor on an MFA challenge and verifies it for the club', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { token: 'after-mfa' } });

        arriveWith('#mfa_challenge=the-challenge&club=north');

        const box = await screen.findByLabelText('Authentication code');
        expect(window.location.hash).toBe('');
        fireEvent.change(box, { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
        expect(api.post).toHaveBeenCalledWith(
            '/api/auth/mfa/verify',
            { challengeToken: 'the-challenge', code: '123456' },
            { headers: { 'X-Tenant': 'north' } },
        );
        expect(post).not.toHaveBeenCalled();
    });

    it('says the link was incomplete when there is no fragment, and calls nothing', async () => {
        arriveWith('');

        expect(await screen.findByRole('alert')).toHaveTextContent('incomplete');
        expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
        expect(post).not.toHaveBeenCalled();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('says the link was incomplete for a malformed fragment, and clears it', async () => {
        arriveWith('#token=garbage&refresh=x');

        expect(await screen.findByRole('alert')).toHaveTextContent('incomplete');
        expect(window.location.hash).toBe('');
        expect(post).not.toHaveBeenCalled();
    });

    it('shows the refusal when the refresh token is not accepted, and stores nothing', async () => {
        post.mockRejectedValue(new Error('refused'));

        arriveWith(`#token=${JWT}&refresh=spent&club=`);

        expect(await screen.findByRole('alert')).toHaveTextContent('incomplete');
        expect(tokenStore.token).toBeNull();
        expect(replace).not.toHaveBeenCalled();
    });
});
