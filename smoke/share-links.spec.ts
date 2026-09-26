import { test, expect } from '@playwright/test';
import {
    FALLBACK_MAX_SHARE_LINK_DAYS,
    maxShareLinkDays,
    reportedMaxShareLinkDays,
    shareLinkExpiry,
} from '../src/lib/share-links';
import { smokeApiUrl } from './api-url';

/**
 * The longest expiry the panel offers, against the server that decides it.
 *
 * The console reads the maximum off the list response and falls back to 90 days when nothing is
 * reported, which is every barakoCMS to date. A fallback nobody checks is the thing this issue was
 * filed about, so this creates a link at whatever maximum the console would offer and fails if the
 * API refuses it.
 *
 * Share links arrived after barakoCMS 4.1.0, so against 4.1.0 or older this skips. The
 * release pull requests pin and the nightly's master both have them, so both have to pass.
 */

const API = smokeApiUrl();
const TOKEN = process.env.SMOKE_TOKEN || '';
const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Tenant': 'default' };

test('the API accepts a share link at the maximum expiry the console offers', async ({ request }) => {
    expect(TOKEN, 'SMOKE_TOKEN must carry the seeded administrator token').not.toBe('');

    const list = await request.get(`${API}/api/site/share-links`, { headers });
    test.skip(list.status() === 404, 'this API has no share links');
    expect(list.status()).toBe(200);

    const reported = reportedMaxShareLinkDays(await list.json());
    const max = maxShareLinkDays(reported);
    const why =
        reported === null
            ? `the API reports no maximum, so the console offered its ${FALLBACK_MAX_SHARE_LINK_DAYS} day fallback`
            : `the API reported a ${reported} day maximum`;

    const created = await request.post(`${API}/api/site/share-links`, {
        headers,
        data: { label: `smoke max ${Date.now().toString(36)}`, expiresAt: shareLinkExpiry(max, max) },
    });
    expect([200, 201], why).toContain(created.status());

    const link: { id: string; key: string } = await created.json();
    expect(link.key, 'the create response carries the key once').toBeTruthy();

    // Leave nothing behind: a tenant is capped at 100 active links.
    const revoked = await request.delete(`${API}/api/site/share-links/${link.id}`, { headers });
    expect(revoked.status()).toBe(204);
});
