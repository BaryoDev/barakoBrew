import { test, expect } from '@playwright/test';
import { MOCK_TOKEN, stubShell, stubContentTypes, unauthed, fillSignIn, pageOf, EMPTY_PAGE } from './helpers';

// A fresh context per test, with nothing stored: the new-device step is what a browser the server
// has never seen gets, so no trusted-device state may leak in from a previous run.
test.use({ storageState: { cookies: [], origins: [] } });

const SESSION = () => ({
    token: MOCK_TOKEN,
    expiry: new Date(Date.now() + 900_000).toISOString(),
    refreshToken: 'mock-refresh',
    refreshTokenExpiry: new Date(Date.now() + 7 * 86400_000).toISOString(),
});

test.describe('Sign in: new-device step', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => window.localStorage.clear());
        await unauthed(page);
        await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { methods: ['password', 'email-code'] } }));
        await page.route('**/api/auth/login', (route) =>
            route.fulfill({
                json: {
                    token: '',
                    refreshToken: '',
                    requiresDeviceApproval: true,
                    message: 'Enter the code we emailed.',
                    email: 'ana@cafe.example',
                },
            })
        );
    });

    async function toCodeStep(page: import('@playwright/test').Page) {
        await page.goto('/login');
        await fillSignIn(page, 'ana', 'correct-password');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    }

    test('a correct password on a new browser asks for the emailed code', async ({ page }) => {
        await toCodeStep(page);

        await expect(page.getByText('ana@cafe.example')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Send a new code' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Not you? Go back' })).toBeVisible();
        await expect(page.getByText(/trusts this browser for 30 days/)).toBeVisible();
    });

    test('Continue stays off until there are six digits, and the field keeps only digits', async ({ page }) => {
        await toCodeStep(page);
        const code = page.getByLabel('Device approval code');
        const next = page.getByRole('button', { name: 'Continue' });

        await expect(next).toBeDisabled();
        await code.fill('12a3-4');
        await expect(code).toHaveValue('1234');
        await expect(next).toBeDisabled();
        await code.fill('1234567890');
        await expect(code).toHaveValue('123456');
        await expect(next).toBeEnabled();
    });

    test('a wrong code shows the inline error and stays on the step', async ({ page }) => {
        await page.route('**/api/auth/otp/verify', (route) =>
            route.fulfill({ status: 400, json: { message: 'Invalid or expired code.' } })
        );
        await toCodeStep(page);
        const code = page.getByLabel('Device approval code');

        await code.fill('000000');
        await page.getByRole('button', { name: 'Continue' }).click();

        await expect(page.getByRole('alert').filter({ hasText: 'That code did not match. Check the newest email' })).toBeVisible();
        await expect(code).toHaveAttribute('aria-invalid', 'true');
        await expect(page).toHaveURL(/\/login/);
        expect(await page.evaluate(() => window.localStorage.getItem('barako_token'))).toBeFalsy();
        // The field is emptied so the next try starts clean, and Continue is off again.
        await expect(code).toHaveValue('');
        await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    test('the right code after a wrong one signs in', async ({ page }) => {
        let attempts = 0;
        await page.route('**/api/auth/otp/verify', (route) => {
            attempts += 1;
            const body = route.request().postDataJSON();
            return body.code === '123456'
                ? route.fulfill({ json: SESSION() })
                : route.fulfill({ status: 400, json: { message: 'Invalid or expired code.' } });
        });
        await stubShell(page);
        await stubContentTypes(page);
        await page.route('**/api/workflows**', (r) => r.fulfill({ json: pageOf([]) }));
        await page.route('**/api/contents**', (r) => r.fulfill({ json: EMPTY_PAGE }));
        await toCodeStep(page);
        const code = page.getByLabel('Device approval code');

        await code.fill('000000');
        await page.getByRole('button', { name: 'Continue' }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'That code did not match. Check the newest email' })).toBeVisible();

        await code.fill('123456');
        await page.getByRole('button', { name: 'Continue' }).click();

        await expect(page).toHaveURL('/', { timeout: 10000 });
        expect(attempts).toBe(2);
    });

    test('Send a new code asks the server again for the same address', async ({ page }) => {
        const requested: unknown[] = [];
        await page.route('**/api/auth/otp/request', (route) => {
            requested.push(route.request().postDataJSON());
            return route.fulfill({ json: { message: 'If that email is registered, a sign-in code has been sent.' } });
        });
        await toCodeStep(page);

        await page.getByRole('button', { name: 'Send a new code' }).click();

        await expect.poll(() => requested).toEqual([{ email: 'ana@cafe.example' }]);
    });

    test('Not you? Go back returns to the sign-in form with the password cleared', async ({ page }) => {
        await toCodeStep(page);

        await page.getByRole('button', { name: 'Not you? Go back' }).click();

        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
        await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    });

    test('the authenticator variant offers a recovery code and no resend', async ({ page }) => {
        await page.route('**/api/auth/login', (route) =>
            route.fulfill({ json: { token: '', refreshToken: '', requiresMfa: true, mfaChallengeToken: 'challenge-abc' } })
        );
        await page.goto('/login');
        await fillSignIn(page, 'ana', 'correct-password');
        await page.getByRole('button', { name: 'Sign in' }).click();

        await expect(page.getByLabel('Authentication code')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Send a new code' })).toHaveCount(0);
        await page.getByRole('button', { name: 'Use a recovery code' }).click();
        await expect(page.getByLabel('Recovery code')).toBeVisible();
    });
});

test.describe('Sign in: layout', () => {
    test.beforeEach(async ({ page }) => {
        await unauthed(page);
        await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { methods: ['password', 'email-code'] } }));
        await page.route('**/health**', (r) => r.fulfill({ json: { status: 'Healthy' } }));
    });

    test('at 400px no tab wraps and the brand panel is hidden', async ({ page }) => {
        await page.setViewportSize({ width: 400, height: 800 });
        await page.goto('/login');

        const tabs = page.getByRole('tab');
        await expect(tabs).toHaveCount(2);
        // A wrapped label has text on more than one line. Count the distinct line tops of each
        // tab's own text, so the icon beside it does not count as a second line.
        const lines = await tabs.evaluateAll((els) =>
            els.map((el) => {
                const tops = new Set<number>();
                for (const node of Array.from(el.childNodes)) {
                    if (node.nodeType !== Node.TEXT_NODE) continue;
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    for (const rect of Array.from(range.getClientRects())) tops.add(Math.round(rect.top));
                }
                return tops.size;
            })
        );
        expect(lines).toEqual([1, 1]);
        await expect(page.getByTestId('instance-card')).toBeHidden();
    });

    test('at 900px the brand panel shows the promise and the reachability card', async ({ page }) => {
        await page.setViewportSize({ width: 900, height: 800 });
        await page.goto('/login');

        await expect(page.getByText('Know what your site is doing before anyone asks.')).toBeVisible();
        await expect(page.getByTestId('instance-card')).toContainText(/Reachable/);
    });
});
