import { test, expect } from '@playwright/test';
import type { ContentTypeDefinition } from '../src/types/schema';
import { smokeApiUrl } from './api-url';

/**
 * What the Site, Theme and tenant domain screens read, off the real server.
 *
 * The site blueprint arrived after barakoCMS 4.1.0, so against that release the blueprint check
 * skips rather than fails. The nightly runs master, where it has to pass.
 */

const API = smokeApiUrl();
const TOKEN = process.env.SMOKE_TOKEN || '';
const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Tenant': 'default' };

const JSON_FIELDS = ['Colors', 'Fonts', 'Radii', 'Layout', 'OptionColors', 'Variants', 'TopBar', 'HeaderLinks', 'FooterColumns', 'SocialLinks'];

test('the site blueprint creates a single-entry type with the fields the screens edit', async ({ request }) => {
    expect(TOKEN, 'SMOKE_TOKEN must carry the seeded administrator token').not.toBe('');

    const list = await request.get(`${API}/api/content-types/blueprints`, { headers });
    expect(list.status()).toBe(200);
    const blueprints: { name: string }[] = (await list.json()).items;
    expect(blueprints.length).toBeGreaterThan(0);
    test.skip(!blueprints.some((b) => b.name === 'site'), 'this API predates the site blueprint');

    const applied = await request.post(`${API}/api/content-types/blueprints/site`, { headers, data: {} });
    // 409 when an earlier run in the same database applied it already.
    expect([200, 409]).toContain(applied.status());

    const types = await request.get(`${API}/api/content-types?page=1&pageSize=100`, { headers });
    expect(types.status()).toBe(200);
    const site = ((await types.json()).items as ContentTypeDefinition[]).find((t) => t.name === 'site');
    expect(site, 'the site type after applying its blueprint').toBeDefined();
    expect(site!.isSingleton).toBe(true);

    const byName = new Map(site!.fields.map((f) => [f.name, f]));
    expect(byName.get('Name')?.isRequired).toBe(true);
    for (const name of JSON_FIELDS) {
        expect(byName.get(name)?.type, `${name} on the site type`).toBe('json');
    }
});

test('every tenant reports its domains as a list', async ({ request }) => {
    expect(TOKEN, 'SMOKE_TOKEN must carry the seeded administrator token').not.toBe('');

    const handle = `smoke-site-${Date.now().toString(36)}`;
    const created = await request.post(`${API}/api/tenants`, {
        headers,
        data: { Handle: handle, Name: 'Smoke site', IsActive: false },
    });
    expect(created.status()).toBe(200);

    const response = await request.get(`${API}/api/tenants?page=1&pageSize=100`, { headers });
    expect(response.status()).toBe(200);
    const tenants: { slug: string; domains: unknown }[] = (await response.json()).items;
    expect(tenants.length).toBeGreaterThan(0);
    for (const tenant of tenants) {
        expect(Array.isArray(tenant.domains), `${tenant.slug} arrived without a domains list`).toBe(true);
    }
});
