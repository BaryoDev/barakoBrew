import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

/**
 * Signing out has to revoke the refresh cookie on the server, not just forget the access token here.
 *
 * The logout call is authorised by the access token. That token lives 15 minutes and is not there at
 * all after a reload, so a sign-out that simply sends whatever is in memory gets a 401 and revokes
 * nothing, and the cookie refreshes straight back into the session for whoever uses this browser next.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const { api, ensureSession, tokenStore, __resetSessionBootstrapForTests } = await import('@/lib/api');
const { useAuth } = await import('./use-auth');
const { toast } = await import('sonner');

const originalAdapter = api.defaults.adapter;

function jwt(expiresInSeconds: number, jti: string): string {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
    const payload = { UserId: 'u1', Username: 'admin', jti, exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.sig`;
}

const EXPIRED = jwt(-60, 'expired');
const FRESH = jwt(900, 'fresh');
const LIVE = jwt(900, 'live');

let logoutCalls: string[] = [];
let acceptedBearers: string[] = [];

function respond(config: InternalAxiosRequestConfig, status: number) {
    const response = { status, statusText: String(status), headers: {}, config, data: {} };
    if (status >= 200 && status < 300) return response;
    throw new AxiosError(String(status), 'ERR_BAD_REQUEST', config, null, response);
}

function refreshSucceeds(token: string) {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { token }, headers: {} });
}

function refreshFails() {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh refused'));
}

function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: new QueryClient() }, children);
}

async function signOut() {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
        await result.current.logout();
    });
}

beforeEach(async () => {
    // The hook runs the page-load refresh on mount. Settle it here, with a token present so it sends
    // nothing, and every refresh a test counts is one that signing out made.
    __resetSessionBootstrapForTests();
    tokenStore.set(LIVE);
    await ensureSession();
    tokenStore.clear();

    logoutCalls = [];
    acceptedBearers = [`Bearer ${FRESH}`, `Bearer ${LIVE}`];
    api.defaults.adapter = async (config) => {
        const bearer = String(config.headers?.Authorization ?? '');
        if (config.url === '/api/auth/logout') {
            logoutCalls.push(bearer);
            return respond(config, acceptedBearers.includes(bearer) ? 200 : 401);
        }
        return respond(config, 200);
    };
    push.mockReset();
    vi.mocked(toast.error).mockReset();
});

afterEach(() => {
    api.defaults.adapter = originalAdapter;
    tokenStore.clear();
    vi.restoreAllMocks();
});

describe('signing out', () => {
    it('refreshes an expired access token first, then revokes with the new one', async () => {
        tokenStore.set(EXPIRED);
        refreshSucceeds(FRESH);

        await signOut();

        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/api/auth/refresh'), {}, expect.anything());
        expect(logoutCalls).toEqual([`Bearer ${FRESH}`]);
        expect(toast.error).not.toHaveBeenCalled();
        expect(tokenStore.token).toBeNull();
        expect(push).toHaveBeenCalledWith('/login');
    });

    it('refreshes from the cookie when there is no access token at all, as after a reload', async () => {
        refreshSucceeds(FRESH);

        await signOut();

        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(logoutCalls).toEqual([`Bearer ${FRESH}`]);
        expect(toast.error).not.toHaveBeenCalled();
        expect(tokenStore.token).toBeNull();
    });

    it('uses a live access token directly, without a refresh', async () => {
        tokenStore.set(LIVE);
        refreshSucceeds(FRESH);

        await signOut();

        expect(axios.post).not.toHaveBeenCalled();
        expect(logoutCalls).toEqual([`Bearer ${LIVE}`]);
        expect(toast.error).not.toHaveBeenCalled();
        expect(tokenStore.token).toBeNull();
    });

    it('refreshes once and retries when the server refuses a token that looked live', async () => {
        acceptedBearers = [`Bearer ${FRESH}`];
        tokenStore.set(LIVE);
        refreshSucceeds(FRESH);

        await signOut();

        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(logoutCalls).toEqual([`Bearer ${LIVE}`, `Bearer ${FRESH}`]);
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('says the server sign-out was not confirmed when the refresh fails, and still clears this tab', async () => {
        tokenStore.set(EXPIRED);
        refreshFails();

        await signOut();

        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(logoutCalls).toEqual([]);
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(String(vi.mocked(toast.error).mock.calls[0][0])).toMatch(/could not be confirmed/i);
        expect(tokenStore.token).toBeNull();
        expect(push).toHaveBeenCalledWith('/login');
    });

    it('stops after one refresh when the server keeps refusing, and says so', async () => {
        acceptedBearers = [];
        tokenStore.set(LIVE);
        refreshSucceeds(FRESH);

        await signOut();

        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(logoutCalls).toEqual([`Bearer ${LIVE}`, `Bearer ${FRESH}`]);
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(tokenStore.token).toBeNull();
        expect(push).toHaveBeenCalledWith('/login');
    });

    it('says the server sign-out was not confirmed when the logout call fails for another reason', async () => {
        tokenStore.set(LIVE);
        refreshSucceeds(FRESH);
        api.defaults.adapter = async (config) => {
            if (config.url === '/api/auth/logout') logoutCalls.push(String(config.headers?.Authorization ?? ''));
            return respond(config, 500);
        };

        await signOut();

        expect(axios.post).not.toHaveBeenCalled();
        expect(logoutCalls).toEqual([`Bearer ${LIVE}`]);
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(tokenStore.token).toBeNull();
    });
});
