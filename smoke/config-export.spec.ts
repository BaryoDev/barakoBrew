import { test, expect } from '@playwright/test';
import { smokeApiUrl } from './api-url';

/**
 * What the Settings, Export and import page reads from the config export, off the real server.
 *
 * The page keeps sections as objects keyed by name or id, reads `withheld` and `gaps` for what the
 * file does not hold, and sends the same document back to `/api/config/plan`. A mocked spec can
 * return any shape it likes, so this holds the page's belief about the shape to the real answer.
 *
 * The config routes arrived with API contract 8 (barakoCMS 5.0.0). Against an older API the test
 * skips rather than fails, as the pinned release may be older than that.
 */

// The first contract version with the config routes. Held here, not imported from the page's hook,
// because that module needs the browser's bundler aliases and this pack runs in Node.
const CONFIG_ROUTES_CONTRACT = 8;

const API = smokeApiUrl();
const TOKEN = process.env.SMOKE_TOKEN || '';
const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Tenant': 'default' };

test('the config export answers a keyed document the plan route accepts', async ({ request }) => {
    expect(TOKEN, 'SMOKE_TOKEN must carry the seeded administrator token').not.toBe('');

    const exported = await request.get(`${API}/api/config/export?sections=contentTypes,contents`, { headers });
    const contract = Number(exported.headers()['x-api-contract-version'] ?? 0);
    test.skip(contract < CONFIG_ROUTES_CONTRACT, 'this API predates the config routes');

    expect(exported.status()).toBe(200);
    const body = await exported.json();
    expect(typeof body.version).toBe('number');
    // A section is an object keyed by name or id, not a list.
    for (const name of ['contentTypes', 'contents']) {
        if ((body.withheld ?? []).includes(name)) {
            expect(body[name], `${name} is withheld`).toBeUndefined();
        } else {
            expect(typeof body[name], name).toBe('object');
            expect(Array.isArray(body[name]), `${name} is not a list`).toBe(false);
        }
    }
    if (body.gaps !== undefined) {
        for (const lines of Object.values(body.gaps as Record<string, unknown>)) {
            expect(Array.isArray(lines)).toBe(true);
        }
    }

    // What the page sends back to preview: the sections it has, and the version.
    const document: Record<string, unknown> = { version: body.version };
    if (body.contentTypes) document.contentTypes = body.contentTypes;
    if (body.contents) document.contents = body.contents;
    const planned = await request.post(`${API}/api/config/plan`, { headers, data: { document } });
    expect(planned.status()).toBe(200);
    const plan = await planned.json();
    expect(Array.isArray(plan.errors)).toBe(true);
    expect(Array.isArray(plan.refusals)).toBe(true);
    expect(Array.isArray(plan.sections)).toBe(true);
});
