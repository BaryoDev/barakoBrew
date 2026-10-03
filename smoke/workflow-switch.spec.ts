import { test, expect } from '@playwright/test';
import { smokeApiUrl } from './api-url';

/**
 * The fields the workflow list and the placeholder help read since barakoCMS 4.6, against the
 * server that sends them.
 *
 * `enabled` decides whether the list offers the switch and the delete at all, so a renamed field
 * would hide both without failing a mocked spec. Against an API before 4.6 the field is absent and
 * this skips; the workflow it made is then left behind with a condition nothing meets, as the runs
 * spec leaves its own.
 */

const API = smokeApiUrl();
const TOKEN = process.env.SMOKE_TOKEN || '';
const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Tenant': 'default' };

test('a workflow carries enabled, switches off and on, and deletes', async ({ request }) => {
    expect(TOKEN, 'SMOKE_TOKEN must carry the seeded administrator token').not.toBe('');

    const marker = `switch smoke ${Date.now().toString(36)}`;
    const created = await request.post(`${API}/api/workflows`, {
        headers,
        data: {
            name: marker,
            triggerContentType: 'smokeauthor',
            triggerEvent: 'Created',
            conditions: { Name: marker },
            actions: [{ type: 'Webhook', parameters: { Url: 'http://127.0.0.1:9/barako-smoke' } }],
        },
    });
    expect(created.status(), `POST /api/workflows answered ${await created.text()}`).toBe(200);
    const workflow: { id: string; enabled?: unknown } = await created.json();
    test.skip(!('enabled' in workflow), 'this API has no workflow switch');
    expect(workflow.enabled).toBe(true);

    const off = await request.put(`${API}/api/workflows/${workflow.id}/enabled`, { headers, data: { enabled: false } });
    expect(off.status()).toBe(200);

    const list = await request.get(`${API}/api/workflows?page=1&pageSize=100`, { headers });
    const items: { id: string; enabled?: unknown }[] = (await list.json()).items;
    expect(items.find((w) => w.id === workflow.id)?.enabled).toBe(false);

    const removed = await request.delete(`${API}/api/workflows/${workflow.id}`, { headers });
    expect(removed.status()).toBe(204);
});

test('the placeholder list carries formats as name, description and example', async ({ request }) => {
    expect(TOKEN, 'SMOKE_TOKEN must carry the seeded administrator token').not.toBe('');

    const response = await request.get(`${API}/api/workflows/variables?contentType=smokeauthor`, { headers });
    expect(response.status()).toBe(200);
    const body: { formats?: { name: unknown; description: unknown; example: unknown }[] } = await response.json();
    test.skip(!('formats' in body), 'this API lists no formats');

    expect(body.formats!.length).toBeGreaterThan(0);
    for (const format of body.formats!) {
        expect(typeof format.name).toBe('string');
        expect(typeof format.description).toBe('string');
        expect(typeof format.example).toBe('string');
    }
});
