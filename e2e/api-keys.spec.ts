import { test, expect } from '@playwright/test';
import { authed, stubShell, pageOf, stubContentTypes } from './helpers';

/**
 * API keys admin page (Phase 2). Route-mocked, driving the real page: the list renders, creating a
 * key shows the secret exactly once in a copy box, and revoke calls the API. The "shown once" flow is
 * the security-relevant bit — the secret must appear on create and never in the listing.
 */

const KEY = {
  id: 'k1',
  name: 'CI deploy',
  prefix: 'bcms_ab12cd34',
  scopes: ['content:read'],
  tenantSlug: 'default',
  expiresAt: null,
  lastUsedAt: null,
  revoked: false,
  createdAt: new Date().toISOString(),
};

test.describe('API keys', () => {
  test('lists keys and never shows a full secret', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await page.route('**/api/api-keys**', (r) => r.fulfill({ json: pageOf([KEY]) }));

    await page.goto('/api-keys');
    await expect(page.getByRole('heading', { name: 'API keys' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('CI deploy')).toBeVisible();
    await expect(page.getByText('bcms_ab12cd34…')).toBeVisible();
    // A listing must never contain a full usable secret.
    await expect(page.getByTestId('api-key-secret')).toHaveCount(0);
  });

  test('creating a key shows the secret once', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await page.route('**/api/api-keys**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: { ...KEY, id: 'new', name: 'My key', key: 'bcms_THEFULLSECRETVALUE123456' },
        });
      }
      return route.fulfill({ json: pageOf([]) }); // start empty
    });

    await page.goto('/api-keys');
    await page.getByRole('button', { name: 'New key' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Name').fill('My key');
    // content:read is checked by default; create.
    await page.getByRole('button', { name: 'Create key' }).click();

    // The copy-once view shows the full secret.
    const secret = page.getByTestId('api-key-secret');
    await expect(secret).toBeVisible({ timeout: 10000 });
    await expect(secret).toHaveValue('bcms_THEFULLSECRETVALUE123456');
    await expect(page.getByText(/it cannot be shown again/i)).toBeVisible();

    // Done clears it. Nothing in the page holds it afterwards, the mutation cache included.
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(secret).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('bcms_THEFULLSECRETVALUE123456');
  });

  test('revoke calls the API', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    let deleted = false;
    // Register the collection route first, then the specific /k1 route — Playwright checks the most
    // recently registered route first, so /k1 must come last to win for the DELETE.
    await page.route('**/api/api-keys**', (r) => r.fulfill({ json: pageOf([KEY]) }));
    await page.route('**/api/api-keys/k1', (route) => {
      if (route.request().method() === 'DELETE') {
        deleted = true;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });

    // The confirm() prompt must be accepted for the revoke to fire.
    page.on('dialog', (d) => d.accept());

    await page.goto('/api-keys');
    await page.getByRole('button', { name: /Revoke CI deploy/i }).click();
    await expect.poll(() => deleted, { timeout: 10000 }).toBe(true);
  });

  test('a key can be limited to content types, and the list shows them', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, [
      { name: 'changelog', displayName: 'Changelog', fields: [] },
      { name: 'contributor', displayName: 'Contributor', fields: [] },
    ]);
    let body: Record<string, unknown> | null = null;
    await page.route('**/api/api-keys**', (route) => {
      if (route.request().method() === 'POST') {
        body = route.request().postDataJSON();
        return route.fulfill({
          json: { ...KEY, id: 'new', name: 'Push', contentTypes: ['changelog'], key: 'bcms_THEFULLSECRETVALUE123456' },
        });
      }
      return route.fulfill({ json: pageOf([{ ...KEY, contentTypes: ['contributor'] }]) });
    });

    await page.goto('/api-keys');
    await expect(page.getByRole('columnheader', { name: 'Content types' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('row', { name: /CI deploy/ })).toContainText('contributor');

    await page.getByRole('button', { name: 'New key' }).first().click();
    const types = page.getByRole('group', { name: 'Content types' });
    await expect(types).toContainText('POST /api/collections/{type}/push');
    await page.getByLabel('Name').fill('Push');
    await page.locator('[id="scope-content:write"]').check();
    await types.getByRole('checkbox', { name: 'Changelog' }).check();
    await page.getByRole('button', { name: 'Create key' }).click();

    await expect(page.getByTestId('api-key-secret')).toBeVisible({ timeout: 10000 });
    expect(body).toMatchObject({ name: 'Push', contentTypes: ['changelog'] });
  });

  test('an API that does not return contentTypes gets the screen it always had', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await page.route('**/api/api-keys**', (r) => r.fulfill({ json: pageOf([KEY]) }));

    await page.goto('/api-keys');
    await expect(page.getByText('CI deploy')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('columnheader', { name: 'Content types' })).toHaveCount(0);
    await page.getByRole('button', { name: 'New key' }).first().click();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Content types' })).toHaveCount(0);
  });
});
