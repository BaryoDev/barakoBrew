import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { api, refreshSession, tokenStore } from '@/lib/api';

const originalAdapter = api.defaults.adapter;

function refused(status: number): AxiosError {
    const config = { headers: {} } as InternalAxiosRequestConfig;
    return new AxiosError('refused', 'ERR_BAD_RESPONSE', config, null, {
        status,
        statusText: String(status),
        headers: {},
        config,
        data: {},
    });
}

beforeEach(() => {
    tokenStore.set('live-token');
});

afterEach(() => {
    api.defaults.adapter = originalAdapter;
    tokenStore.clear();
    vi.restoreAllMocks();
});

describe('a refresh that fails', () => {
    it('keeps the access token when the server answers 503', async () => {
        vi.spyOn(axios, 'post').mockRejectedValue(refused(503));

        expect(await refreshSession()).toBeNull();

        expect(tokenStore.token).toBe('live-token');
    });

    it('keeps the access token when the request never gets an answer', async () => {
        vi.spyOn(axios, 'post').mockRejectedValue(new AxiosError('timeout of 30000ms exceeded', 'ECONNABORTED'));

        expect(await refreshSession()).toBeNull();

        expect(tokenStore.token).toBe('live-token');
    });

    it('clears the access token when the server answers 401', async () => {
        vi.spyOn(axios, 'post').mockRejectedValue(refused(401));

        expect(await refreshSession()).toBeNull();

        expect(tokenStore.token).toBeNull();
    });

    it('clears the access token when the server answers 403', async () => {
        vi.spyOn(axios, 'post').mockRejectedValue(refused(403));

        expect(await refreshSession()).toBeNull();

        expect(tokenStore.token).toBeNull();
    });
});

describe('outbound request timeouts', () => {
    it('gives the refresh call a timeout', async () => {
        const post = vi.spyOn(axios, 'post').mockRejectedValue(refused(503));

        await refreshSession();

        expect(post).toHaveBeenCalledTimes(1);
        const options = post.mock.calls[0][2];
        expect(options?.timeout).toBeGreaterThan(0);
    });

    it('gives a plain request a timeout, and a file upload a longer one', async () => {
        const seen: Record<string, number | undefined> = {};
        api.defaults.adapter = async (config) => {
            seen[config.method ?? ''] = config.timeout;
            return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
        };

        await api.get('/api/content');
        await api.post('/api/files', new FormData());

        expect(seen.get).toBeGreaterThan(0);
        expect(seen.post).toBeGreaterThan(seen.get as number);
    });
});
