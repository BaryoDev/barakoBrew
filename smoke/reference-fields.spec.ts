import { test, expect } from '@playwright/test';
import type { ContentTypeDefinition } from '../src/types/schema';

/**
 * The one thing a reference field needs from the server, read off the real server.
 *
 * `FieldDefinition.referenceType` names the content type a reference points at, and the console's
 * picker is built entirely on it: no target type means no list to search and no title to show, so
 * the field falls back to the id box it used to be. Nothing in the mocked pack can prove the server
 * sends it, because those fixtures are written here.
 *
 * This is the same shape as the bug that pack exists for. The console carried a `FieldDefinition`
 * without `referenceType` for a year, the information arrived on every response, and every test
 * passed while every relation was unusable.
 *
 * Read with the seeded administrator's token rather than through the browser, so it costs none of
 * the five auth requests the API allows per fifteen minutes.
 */

const API = process.env.SMOKE_API_URL || 'http://127.0.0.1:5099';
const TOKEN = process.env.SMOKE_TOKEN || '';

let types: ContentTypeDefinition[];

test.beforeAll(async ({ request }) => {
    expect(TOKEN, 'SMOKE_TOKEN must carry the seeded administrator token').not.toBe('');

    const response = await request.get(`${API}/api/content-types?page=1&pageSize=50`, {
        headers: { Authorization: `Bearer ${TOKEN}`, 'X-Tenant': 'default' },
    });
    expect(response.status(), 'the API did not serve its content types').toBe(200);

    types = (await response.json()).items;
    // Nothing below means anything over an empty list, and an empty list here is a seeding failure
    // rather than a contract one.
    expect(types.length).toBeGreaterThan(0);
});

test('a reference field arrives with the content type it points at', () => {
    const post = types.find((t) => t.name === 'smokepost');
    expect(post, 'the seeded smokepost type is missing').toBeDefined();
    expect(post!.fields.length).toBeGreaterThan(0);

    const reference = post!.fields.find((f) => f.name === 'Author');
    expect(reference, 'the seeded Author field is missing').toBeDefined();
    expect(reference!.type.toLowerCase()).toBe('reference');
    expect(
        reference!.referenceType,
        'the API returned a reference field with no target type, so the console can only offer an id box for it'
    ).toBe('smokeauthor');
});

test('the target type is one the console can list entries of', async ({ request }) => {
    const post = types.find((t) => t.name === 'smokepost');
    const target = post?.fields.find((f) => f.name === 'Author')?.referenceType;
    expect(target).toBeDefined();

    // The picker queries the entry list by content type, and that filter is an exact match on the
    // server, so the name the definition carries has to be a name the type list also carries.
    expect(types.map((t) => t.name)).toContain(target);

    const response = await request.get(
        `${API}/api/contents?page=1&pageSize=20&contentType=${encodeURIComponent(target!)}`,
        { headers: { Authorization: `Bearer ${TOKEN}`, 'X-Tenant': 'default' } }
    );
    expect(response.status()).toBe(200);
    const items = (await response.json()).items;
    expect(
        items.length,
        'the target type has no entries, so the picker would open on an empty list'
    ).toBeGreaterThan(0);
});
