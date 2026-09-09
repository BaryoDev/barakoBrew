import { test, expect } from '@playwright/test';
import { fillSignIn } from './helpers';

test.describe('Runtime Configuration', () => {
    test('routes API calls to the URL from window._env_ (runtime config)', async ({ page }) => {
        // The app populates window._env_ from /env-config.js at load. Overriding that file is the
        // real runtime-config path (injecting _env_ directly is clobbered when env-config.js loads).
        const CUSTOM_API_URL = 'http://runtime-api-test:9999';
        await page.route('**/env-config.js', (r) =>
            r.fulfill({
                contentType: 'application/javascript',
                body: `window._env_ = { NEXT_PUBLIC_API_URL: ${JSON.stringify(CUSTOM_API_URL)} };`,
            })
        );

        // Capture where the login request is actually sent.
        let loginOrigin = '';
        await page.route('**/api/auth/login', (route) => {
            loginOrigin = new URL(route.request().url()).origin;
            return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"x"}' });
        });

        await page.goto('/login');
        await fillSignIn(page, 'u', 'p');
        await page.getByRole('button', { name: 'Sign in' }).click();

        // The request went to the runtime-configured host, not the build-time default.
        await expect.poll(() => loginOrigin, { timeout: 10000 }).toBe(CUSTOM_API_URL);
    });

    test('falls back to the default when env-config.js carries no API URL', async ({ page }) => {
        // This asserted that `window._env_.NEXT_PUBLIC_API_URL` was **defined**, which is the
        // opposite of its own name, and it passed only because the committed `public/env-config.js`
        // hardcoded `http://localhost:5006`. That value outranks `NEXT_PUBLIC_API_URL`, so the
        // documented environment variable did nothing in local development and this test was
        // holding that in place.
        //
        // The file is committed empty now. What matters is that the app still resolves an API and
        // reaches it, which is what the fallback is for.
        let loginOrigin = '';
        await page.route('**/api/auth/login', (route) => {
            loginOrigin = new URL(route.request().url()).origin;
            return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"x"}' });
        });

        await page.goto('/login');
        expect(await page.evaluate(() => window['_env_']?.NEXT_PUBLIC_API_URL)).toBeUndefined();

        await fillSignIn(page, 'u', 'p');
        await page.getByRole('button', { name: 'Sign in' }).click();

        // The port the quickstart publishes, which is what somebody following it will have running.
        await expect.poll(() => loginOrigin, { timeout: 10000 }).toBe('http://localhost:5005');
    });
});
