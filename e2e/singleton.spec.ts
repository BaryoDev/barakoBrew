import { test, expect } from '@playwright/test';
import { authed, pageOf, stubContentTypes, stubShell } from './helpers';

const ID = '0b7c1f0e-6d7a-4f3e-9a51-0d1c2b3a4f50';

const SITE = {
    name: 'sitesettings',
    displayName: 'Site settings',
    isSingleton: true,
    isPubliclyDeliverable: true,
    fields: [{ name: 'Phone', displayName: 'Phone', type: 'string', isRequired: false }],
};

const ARTICLE = { ...SITE, name: 'article', displayName: 'Article', isSingleton: false };

/**
 * Serves the entries of the single-entry type from memory, so a create is visible to the next read
 * the way it is on the server. Returns the bodies POSTed, for the assertions.
 */
async function serveEntries(page: import('@playwright/test').Page, existing: boolean) {
    const posted: unknown[] = [];
    let stored = existing
        ? [
              {
                  id: ID,
                  contentType: 'sitesettings',
                  data: { Phone: 'existing' },
                  status: 'Published',
                  sensitivity: 'Public',
                  version: 1,
                  createdAt: '2026-09-01T00:00:00Z',
                  updatedAt: '2026-09-01T00:00:00Z',
              },
          ]
        : [];

    await page.route(/\/api\/contents(\?|$)/, async (route) => {
        if (route.request().method() === 'POST') {
            const body = route.request().postDataJSON();
            posted.push(body);
            stored = [
                {
                    id: ID,
                    contentType: body.contentType,
                    data: body.data,
                    status: body.status,
                    sensitivity: 'Public',
                    version: 1,
                    createdAt: '2026-09-01T00:00:00Z',
                    updatedAt: '2026-09-01T00:00:00Z',
                },
            ];
            return route.fulfill({ json: { id: ID, version: 1 } });
        }
        const type = new URL(route.request().url()).searchParams.get('contentType');
        return route.fulfill({ json: pageOf(type === 'sitesettings' ? stored : []) });
    });
    await page.route(`**/api/contents/${ID}`, (route) => route.fulfill({ json: stored[0] }));
    await page.route(`**/api/contents/${ID}/history`, (route) => route.fulfill({ json: pageOf([]) }));
    return posted;
}

test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'the rail is a sheet on a phone, and this reaches the screen from the rail');
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, [ARTICLE, SITE]);
});

test('a single-entry type opens from the rail as one form, and the first save creates it', async ({ page }) => {
    const posted = await serveEntries(page, false);

    await page.goto('/api-keys');
    await page.locator('[data-slot="sidebar"]').getByRole('link', { name: 'Site settings' }).click();

    await page.waitForURL('**/content/singleton/sitesettings');
    await expect(page.getByRole('heading', { name: 'Site settings' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New entry' })).toHaveCount(0);

    // The crumb for /content/singleton would lead nowhere, so it is not there.
    const crumbs = page.locator('[data-slot="breadcrumb"]');
    await expect(crumbs.getByRole('link', { name: 'Entries' })).toHaveAttribute('href', '/content');
    await expect(crumbs.getByText('singleton')).toHaveCount(0);

    await page.getByLabel(/Phone/).fill('+63 2 8123 4567');
    await page.getByRole('button', { name: 'Publish' }).click();

    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ contentType: 'sitesettings', data: { Phone: '+63 2 8123 4567' } });
});

test('the list and the new entry form for a single-entry type land on its screen', async ({ page }) => {
    await serveEntries(page, true);

    await page.goto('/content?type=sitesettings');
    await page.waitForURL('**/content/singleton/sitesettings');
    await expect(page.getByRole('textbox', { name: /Phone/ })).toHaveValue('existing');

    await page.goto('/content/new?type=sitesettings');
    await page.waitForURL('**/content/singleton/sitesettings');
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible();
});
