import { test, expect } from '@playwright/test';
import { smokeApiUrl } from './api-url';

/**
 * The three things the entries filter bar asks the API for, read off the real API.
 *
 * Search, the status filter and the version column all do their work on the server. The mocked pack
 * can prove the console sends the parameters, and nothing more: its fixtures are written here, so a
 * server that ignored `search` entirely would keep every mocked spec green while the filter bar
 * showed the whole collection next to a count that agreed with it. That is the failure this pack
 * exists for.
 *
 * `scripts/smoke-check.sh` seeds two entries with different statuses and different text, which is
 * what makes each assertion below able to fail: a filter that returns everything is as wrong as one
 * that returns nothing, and only two unlike rows can tell them apart.
 */

const API = smokeApiUrl();
const TOKEN = process.env.SMOKE_TOKEN || '';

interface Row {
    id: string;
    contentType: string;
    data: Record<string, unknown>;
    status: string;
    version?: number;
}

const headers = () => ({ Authorization: `Bearer ${TOKEN}`, 'X-Tenant': 'default' });

async function list(
    request: import('@playwright/test').APIRequestContext,
    query: string,
): Promise<{ items: Row[]; totalItems: number }> {
    const response = await request.get(`${API}/api/contents?page=1&pageSize=50&${query}`, { headers: headers() });
    expect(response.ok(), `GET /api/contents?${query} answered ${response.status()}`).toBeTruthy();
    return response.json();
}

let all: Row[];
let allTotal: number;
let author: Row;
let post: Row;

test.beforeAll(async ({ request }) => {
    expect(TOKEN, 'SMOKE_TOKEN must carry the seeded administrator token').not.toBe('');

    const everything = await list(request, '');
    all = everything.items;
    allTotal = everything.totalItems;
    // Nothing below means anything over an empty list, and an empty one here is a seeding failure
    // rather than a contract one.
    expect(all.length, 'the API listed no entries at all').toBeGreaterThan(1);

    const found = (type: string) => {
        const row = all.find((r) => r.contentType === type);
        expect(row, `scripts/smoke-check.sh seeds a ${type} entry and the API did not list one`).toBeDefined();
        return row!;
    };
    author = found('smokeauthor');
    post = found('smokepost');

    // The two seeded rows differ in status, which is what gives the status filter something to
    // narrow. If they ever stop differing, every assertion about it below becomes free.
    expect(author.status).not.toBe(post.status);
});

test('every listed entry carries a version, and it is the one the entry itself reports', async ({ request }) => {
    for (const row of all) {
        expect(typeof row.version, `${row.id} arrived with no version, so the V column has nothing to show`).toBe(
            'number',
        );
    }

    // A seeded entry was written through the API, so it has a stream and a version above zero. Zero
    // is what the API sends for an entry with no stream, and the console reads that as "no version"
    // rather than as version zero.
    expect(post.version).toBeGreaterThan(0);

    const detail = await request.get(`${API}/api/contents/${post.id}`, { headers: headers() });
    expect(detail.ok(), `GET /api/contents/${post.id} answered ${detail.status()}`).toBeTruthy();
    expect(post.version, 'the list and the entry disagree about its version').toBe((await detail.json()).version);
});

test('search narrows the list on the server, and matches a value rather than a field name', async ({ request }) => {
    const term = String(author.data.Name ?? '');
    expect(term, 'the seeded author entry has no Name to search for').not.toBe('');

    const matched = await list(request, `search=${encodeURIComponent(term)}`);

    expect(matched.items.length, `nothing matched "${term}", which the seeded entry holds`).toBeGreaterThan(0);
    expect(matched.items.map((r) => r.id)).toContain(author.id);
    // And it narrowed. A server ignoring the parameter would answer with the other seeded entry too.
    expect(matched.items.map((r) => r.id)).not.toContain(post.id);
    expect(matched.totalItems, 'the search returned as many entries as an unfiltered list').toBeLessThan(allTotal);

    // Field names are not values. Every entry of a type with a Name field would come back if they
    // were, which is a search box that looks like it works and answers nonsense.
    const byFieldName = await list(request, 'search=Name');
    expect(byFieldName.items.map((r) => r.id)).not.toContain(author.id);
});

test('the status filter narrows the list on the server', async ({ request }) => {
    const wanted = post.status;
    const filtered = await list(request, `status=${encodeURIComponent(wanted)}`);

    expect(filtered.items.length, `no entry came back with status ${wanted}`).toBeGreaterThan(0);
    for (const row of filtered.items) {
        expect(row.status, `${row.id} came back from a ${wanted} filter`).toBe(wanted);
    }
    // The other seeded entry has a different status, so a server ignoring the parameter would have
    // included it.
    expect(filtered.items.map((r) => r.id)).not.toContain(author.id);
    expect(filtered.items.map((r) => r.id)).toContain(post.id);
});

test('search and status narrow together, not one instead of the other', async ({ request }) => {
    const term = String(post.data.Title ?? '');
    expect(term, 'the seeded post entry has no Title to search for').not.toBe('');

    const both = await list(request, `search=${encodeURIComponent(term)}&status=${encodeURIComponent(author.status)}`);

    // The post matches the text and the author matches the status, so nothing matches both. A server
    // applying only one of the two would answer with a row here.
    expect(both.items).toHaveLength(0);
    expect(both.totalItems).toBe(0);
});
