import { test, expect } from '@playwright/test';
import type { ContentTypeDefinition } from '../src/types/schema';
import { smokeApiUrl } from './api-url';

/**
 * Whether a type holds one entry, read off the real server.
 *
 * The console chooses between a list and one edit screen from `isSingleton`, and has nowhere else
 * to learn it. The mocked pack writes the flag into its own fixtures, so only this can show the
 * server sends it, and sends it as a boolean for every type rather than only for the ones that set it.
 */

const API = smokeApiUrl();
const TOKEN = process.env.SMOKE_TOKEN || '';

test('every content type says whether it holds one entry', async ({ request }) => {
    expect(TOKEN, 'SMOKE_TOKEN must carry the seeded administrator token').not.toBe('');

    const response = await request.get(`${API}/api/content-types?page=1&pageSize=50`, {
        headers: { Authorization: `Bearer ${TOKEN}`, 'X-Tenant': 'default' },
    });
    expect(response.status()).toBe(200);

    const types: ContentTypeDefinition[] = (await response.json()).items;
    expect(types.length).toBeGreaterThan(0);

    for (const type of types) {
        expect(typeof type.isSingleton, `${type.name} arrived without isSingleton`).toBe('boolean');
    }
});
