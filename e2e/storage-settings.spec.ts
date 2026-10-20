import { test, expect } from '@playwright/test';
import { authed, stubShell } from './helpers';

/**
 * The Storage screen against a mocked API: choose S3, a failed test names its step, a passing test
 * unlocks Save, and after a save the secret shows as set while the page never holds its value.
 */

const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

function storedS3() {
  return {
    provider: 's3',
    activeProvider: 's3',
    readOnly: false,
    environmentKeys: [],
    availableProviders: ['postgres', 's3'],
    updatedAt: '2026-10-20T10:00:00Z',
    updatedBy: 'admin',
    s3: {
      bucket: 'media',
      region: 'eu-west-1',
      serviceUrl: null,
      publicBaseUrl: null,
      usePublicReadAcl: false,
      forcePathStyle: true,
      accessKey: 'AKIAEXAMPLE',
      secretSet: true,
    },
  };
}

const DATABASE = {
  provider: 'postgres',
  s3: null,
  activeProvider: 'postgres',
  readOnly: false,
  environmentKeys: [],
  availableProviders: ['postgres', 's3'],
};

test.describe('Storage settings', () => {
  test('choosing S3, a failed test, a passing test, save, and Secret set after a reload', async ({ page }) => {
    await authed(page);
    await stubShell(page);

    let current: unknown = DATABASE;
    let testCalls = 0;
    let saved: { s3?: { secretKey?: string | null } } | null = null;

    await page.route(/\/api\/settings\/storage\/test$/, (route) => {
      testCalls++;
      return route.fulfill({
        json:
          testCalls === 1
            ? { ok: false, step: 'put', errorCode: 'NoSuchBucket', message: 'The specified bucket does not exist.' }
            : { ok: true, message: 'Wrote, read and deleted an object.' },
      });
    });
    await page.route(/\/api\/settings\/storage$/, (route) => {
      if (route.request().method() === 'PUT') {
        saved = route.request().postDataJSON();
        current = storedS3();
        return route.fulfill({ json: current });
      }
      return route.fulfill({ json: current });
    });

    await page.goto('/settings/storage');
    await expect(page.getByRole('heading', { name: 'Storage', exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByRole('radio', { name: 'S3' }).click();
    await page.getByLabel('Bucket').fill('media');
    await page.getByLabel('Region').fill('eu-west-1');
    await page.getByLabel('Access key').fill('AKIAEXAMPLE');
    const secret = page.getByLabel('Secret key');
    await expect(secret).toHaveAttribute('type', 'password');
    await secret.fill(SECRET);

    const save = page.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();

    await page.getByRole('button', { name: 'Test connection' }).click();
    const result = page.getByTestId('storage-test-result');
    await expect(result).toContainText('put');
    await expect(result).toContainText('NoSuchBucket');
    await expect(save).toBeDisabled();

    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(result).toContainText('Connection works');
    await expect(save).toBeEnabled();

    await page.getByLabel('Bucket').fill('media-2');
    await expect(save).toBeDisabled();
    // Back to the values the passing test ran against, so that test covers the form again.
    await page.getByLabel('Bucket').fill('media');
    await expect(save).toBeEnabled();
    await page.getByLabel('Bucket').fill('media-3');
    await expect(save).toBeDisabled();
    await page.getByLabel('Bucket').fill('media');
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(save).toBeEnabled();

    await save.click();
    await expect(page.getByRole('status').filter({ hasText: /Files already stored stay/ })).toBeVisible();
    expect(saved).not.toBeNull();
    expect(saved!.s3!.secretKey).toBe(SECRET);

    await page.reload();
    await expect(page.getByText('Secret set')).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel('Secret key')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(SECRET);
  });

  test('is read-only and names the keys when configuration sets storage', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await page.route(/\/api\/settings\/storage$/, (route) =>
      route.fulfill({ json: { ...storedS3(), readOnly: true, environmentKeys: ['Bucket', 'Region'] } }),
    );

    await page.goto('/settings/storage');
    const notice = page.getByTestId('storage-read-only');
    await expect(notice).toContainText('FILES__S3__BUCKET', { timeout: 15000 });
    await expect(notice).toContainText('FILES__S3__REGION');
    await expect(page.getByLabel('Bucket')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
