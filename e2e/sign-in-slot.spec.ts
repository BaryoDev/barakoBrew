import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MOCK_TOKEN, stubShell, stubContentTypes, unauthed, pageOf, EMPTY_PAGE } from './helpers';

// The dev server registers one fixture tab, `dev-qr`, in place of a package's own registration. Its
// two routes are mocked here, so no API is needed. A fresh context per test keeps state out.
test.use({ storageState: { cookies: [], origins: [] } });

const SESSION = () => ({
    token: MOCK_TOKEN,
    expiry: new Date(Date.now() + 900_000).toISOString(),
    refreshToken: 'mock-refresh',
    refreshTokenExpiry: new Date(Date.now() + 7 * 86400_000).toISOString(),
});

const CREATE = (overrides: Record<string, unknown> = {}) => ({
    qrPayload: 'request:r1',
    matchNumber: '482913',
    secret: 'browser-secret-xyz',
    requestId: 'r1',
    expiresInSeconds: 120,
    intervalSeconds: 1,
    ...overrides,
});

async function stubSignIn(page: Page, methods: string[]) {
    await page.addInitScript(() => window.localStorage.clear());
    await unauthed(page);
    await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { methods } }));
}

async function openPhoneTab(page: Page) {
    await page.goto('/login');
    await page.getByRole('tab', { name: 'Phone' }).click();
}

test.describe('Sign in: registered method slot', () => {
    test('registered_tab_shows_a_code_and_signs_in_after_approval', async ({ page }) => {
        await stubSignIn(page, ['password', 'dev-qr']);
        const polls: unknown[] = [];
        await page.route('**/api/dev-fixture/qr/create', (r) => r.fulfill({ json: CREATE() }));
        await page.route('**/api/dev-fixture/qr/poll', (r) => {
            polls.push(r.request().postDataJSON());
            const url = r.request().url();
            expect(url).not.toContain('browser-secret-xyz');
            const status = polls.length === 1 ? { status: 'scanned' } : { status: 'approved', ...SESSION() };
            return r.fulfill({ json: status });
        });
        await stubShell(page);
        await stubContentTypes(page);
        await page.route('**/api/workflows**', (r) => r.fulfill({ json: pageOf([]) }));
        await page.route('**/api/contents**', (r) => r.fulfill({ json: EMPTY_PAGE }));

        await openPhoneTab(page);

        await expect(page.getByRole('img', { name: /QR code/i })).toBeVisible();
        await expect(page.getByText('482913')).toBeVisible();
        await expect(page.getByText(/Expires in/)).toBeVisible();
        await expect(page.getByText('Scanned. Approve the sign-in on your phone.')).toBeVisible({ timeout: 10_000 });
        await expect(page).toHaveURL('/', { timeout: 15_000 });
        expect(polls[0]).toEqual({ secret: 'browser-secret-xyz', requestId: 'r1' });
    });

    test('denied_request_shows_the_denied_message', async ({ page }) => {
        await stubSignIn(page, ['password', 'dev-qr']);
        await page.route('**/api/dev-fixture/qr/create', (r) => r.fulfill({ json: CREATE() }));
        await page.route('**/api/dev-fixture/qr/poll', (r) => r.fulfill({ json: { status: 'denied' } }));

        await openPhoneTab(page);

        await expect(page.getByText('The sign-in was denied on your phone.')).toBeVisible({ timeout: 10_000 });
        await expect(page).toHaveURL(/\/login/);
        expect(await page.evaluate(() => window.localStorage.getItem('barako_token'))).toBeFalsy();
    });

    test('expired_request_offers_a_new_code', async ({ page }) => {
        await stubSignIn(page, ['password', 'dev-qr']);
        let creates = 0;
        await page.route('**/api/dev-fixture/qr/create', (r) => {
            creates += 1;
            return r.fulfill({
                json: creates === 1 ? CREATE({ expiresInSeconds: 2 }) : CREATE({ matchNumber: '777000' }),
            });
        });
        await page.route('**/api/dev-fixture/qr/poll', (r) => r.fulfill({ json: { status: 'pending' } }));

        await openPhoneTab(page);

        await expect(page.getByText('This code has expired.')).toBeVisible({ timeout: 10_000 });
        await page.getByRole('button', { name: 'Show a new code' }).click();
        await expect(page.getByText('777000')).toBeVisible();
        expect(creates).toBe(2);
    });

    test('tab_is_absent_when_the_api_does_not_list_the_id', async ({ page }) => {
        await stubSignIn(page, ['password', 'email-code']);
        let asked = 0;
        await page.route('**/api/dev-fixture/**', (r) => {
            asked += 1;
            return r.fulfill({ status: 404, json: {} });
        });

        await page.goto('/login');

        await expect(page.getByRole('tab', { name: 'Email code' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Phone' })).toHaveCount(0);
        expect(asked).toBe(0);
    });
});
