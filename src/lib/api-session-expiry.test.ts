import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { api } from '@/lib/api';

const originalAdapter = api.defaults.adapter;

function unauthorised(config: InternalAxiosRequestConfig): never {
    throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        data: {},
    });
}

function stubLocation(pathname: string) {
    const location = { pathname, href: `https://example.com${pathname}` };
    vi.stubGlobal('location', location);
    return location;
}

beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/barakocms');
    api.defaults.adapter = async (config) => unauthorised(config);
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh refused'));
});

afterEach(() => {
    api.defaults.adapter = originalAdapter;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('a session that cannot be refreshed', () => {
    it('sends the browser to the login page under the base path, not the domain root', async () => {
        const location = stubLocation('/barakocms/content');

        await expect(api.get('/api/content')).rejects.toThrow();

        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(location.href).toBe('/barakocms/login');
    });

    it('leaves the login page alone under the base path, so it does not reload in a loop', async () => {
        const location = stubLocation('/barakocms/login');

        await expect(api.get('/api/content')).rejects.toThrow();

        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(location.href).toBe('https://example.com/barakocms/login');
    });

    it('goes to /login at the root when the console is built without a base path', async () => {
        vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
        const location = stubLocation('/content');

        await expect(api.get('/api/content')).rejects.toThrow();

        expect(location.href).toBe('/login');
    });
});
