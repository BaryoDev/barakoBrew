import { test, expect } from '@playwright/test';
import { authed, stubShell, pageOf, stubContentTypes } from './helpers';

/**
 * A status change moves the entry's version on the server. With unsaved edits on screen, the editor
 * reads that move as somebody else's change and raises a conflict banner, and the edit was never
 * published. So the status buttons wait until the edit is saved or discarded.
 */

const CONTENT_ID = '22222222-2222-2222-2222-222222222222';

const detail = {
    id: CONTENT_ID,
    contentType: 'article',
    data: { Title: 'A post' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    status: 'Draft',
    sensitivity: 'Public',
    version: 1,
    scheduledPublishAt: null,
    scheduledUnpublishAt: null,
};

test('Publish and Archive are disabled while the form has unsaved edits', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, [
        { name: 'article', displayName: 'Article', fields: [{ name: 'Title', type: 'string' }] },
    ]);
    await page.route('**/api/contents**', (r) => r.fulfill({ json: pageOf([detail]) }));
    await page.route(`**/api/contents/${CONTENT_ID}`, (r) => r.fulfill({ json: detail }));
    await page.route(`**/api/contents/${CONTENT_ID}/history**`, (r) => r.fulfill({ json: pageOf([]) }));

    await page.goto(`/content/${CONTENT_ID}`);

    const publish = page.getByRole('button', { name: 'Publish', exact: true });
    const archive = page.getByRole('button', { name: 'Archive', exact: true });
    await expect(publish).toBeEnabled();
    await expect(archive).toBeEnabled();

    await page.locator('#Title').fill('A post, edited');

    await expect(publish).toBeDisabled();
    await expect(archive).toBeDisabled();
});
