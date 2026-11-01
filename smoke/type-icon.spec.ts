import { test, expect } from '@playwright/test';
import type { ContentTypeDefinition, ContentTypeIcon } from '../src/types/schema';
import { smokeApiUrl } from './api-url';

/**
 * The icon a content type is drawn with, against the server that stores it.
 *
 * The picker sends `{ icon }` and reads `icon` back off the type list, so a renamed field or a
 * changed shape would show nothing in a mocked spec. A custom SVG is rebuilt by the API: a script
 * is dropped rather than refused, and a document with no viewBox is a 400. Against an API before
 * 5.4 the route is absent and this skips; the type is put back with no icon either way.
 */

const API = smokeApiUrl();
const TOKEN = process.env.SMOKE_TOKEN || '';
const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Tenant': 'default' };
const TYPE = 'smokeauthor';
const ICON_URL = `${API}/api/content-types/${TYPE}/icon`;

test('a type takes a glyph, rebuilds a custom svg, refuses one with no viewBox, and clears', async ({ request }) => {
    expect(TOKEN, 'SMOKE_TOKEN must carry the seeded administrator token').not.toBe('');

    try {
        const glyph = await request.put(ICON_URL, { headers, data: { icon: { name: 'ic-key' } } });
        test.skip(glyph.status() === 404 || glyph.status() === 405, 'this API has no type icon');
        expect(glyph.status(), `PUT icon answered ${await glyph.text()}`).toBe(200);
        const stored: { icon: ContentTypeIcon | null } = await glyph.json();
        expect(stored.icon).toEqual({ name: 'ic-key' });

        const list = await request.get(`${API}/api/content-types?page=1&pageSize=100`, { headers });
        const types: ContentTypeDefinition[] = (await list.json()).items;
        expect(types.find((t) => t.name === TYPE)?.icon).toEqual({ name: 'ic-key' });

        const custom = await request.put(ICON_URL, {
            headers,
            data: {
                icon: {
                    svg: '<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0h24v24H0z" fill="red" onclick="x()"/></svg>',
                },
            },
        });
        expect(custom.status(), `PUT custom icon answered ${await custom.text()}`).toBe(200);
        const rebuilt: { icon: { svg?: string } | null } = await custom.json();
        expect(rebuilt.icon?.svg).toContain('viewBox="0 0 24 24"');
        expect(rebuilt.icon?.svg).toContain('currentColor');
        expect(rebuilt.icon?.svg).not.toMatch(/script|onclick|red/);

        const refused = await request.put(ICON_URL, {
            headers,
            data: { icon: { svg: '<svg><path d="M0 0h24v24H0z"/></svg>' } },
        });
        expect(refused.status()).toBe(400);
        expect(await refused.text()).toContain('viewBox');
    } finally {
        await request.put(ICON_URL, { headers, data: { icon: null } });
    }

    const cleared = await request.get(`${API}/api/content-types?page=1&pageSize=100`, { headers });
    const after: ContentTypeDefinition[] = (await cleared.json()).items;
    expect(after.find((t) => t.name === TYPE)?.icon ?? null).toBeNull();
});
