import { test, expect } from '@playwright/test';
import { authed, stubShell, pageOf } from './helpers';

const NOW = Date.now();

const CURRENT = {
    id: '11111111-1111-1111-1111-111111111111',
    device: 'Chrome on macOS',
    signInMethod: 'password',
    signInIp: '203.0.113.24',
    lastSeenIp: '203.0.113.25',
    startedAt: new Date(NOW - 3 * 3600_000).toISOString(),
    lastSeenAt: new Date(NOW - 60_000).toISOString(),
    current: true,
};

const OTHER = {
    id: '22222222-2222-2222-2222-222222222222',
    device: 'Safari on iPhone',
    signInMethod: 'passkey',
    signInIp: '198.51.100.7',
    lastSeenIp: '198.51.100.8',
    startedAt: new Date(NOW - 2 * 86400_000).toISOString(),
    lastSeenAt: new Date(NOW - 5 * 3600_000).toISOString(),
    current: false,
};

/** Serves the list from a mutable array, so ending a session changes what the next read returns. */
async function stubSessions(page: import('@playwright/test').Page, live: unknown[]) {
    await page.route('**/api/me/sessions**', (r) => {
        if (r.request().method() === 'GET') return r.fulfill({ json: pageOf(live) });
        return r.fallback();
    });
}

test.describe('sessions', () => {
    test('lists the sessions with the current one marked', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await stubSessions(page, [CURRENT, OTHER]);

        await page.goto('/settings/sessions');
        await expect(page.getByRole('heading', { name: 'Sessions', exact: true })).toBeVisible({ timeout: 20000 });

        const table = page.getByRole('table');
        await expect(table.getByText('Chrome on macOS')).toBeVisible();
        await expect(table.getByText('Safari on iPhone')).toBeVisible();
        await expect(table.getByText('203.0.113.24', { exact: true })).toBeVisible();
        await expect(table.getByText('203.0.113.25', { exact: true })).toBeVisible();
        await expect(table.getByText('This device', { exact: true })).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Sign out everywhere else' })).toBeVisible();
    });

    test('shows device text as text, never as markup', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await stubSessions(page, [{ ...OTHER, device: '<img src=x onerror="window.__pwned=1">' }, CURRENT]);

        await page.goto('/settings/sessions');
        await expect(page.getByText('<img src=x onerror="window.__pwned=1">')).toBeVisible({ timeout: 20000 });
        await expect(page.getByRole('table').locator('img')).toHaveCount(0);
        expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    });

    test('signing out another row removes it, and the request names that session', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        const live: unknown[] = [CURRENT, OTHER];
        await stubSessions(page, live);

        const ended: string[] = [];
        await page.route('**/api/me/sessions/*', (r) => {
            if (r.request().method() !== 'DELETE') return r.fallback();
            const id = new URL(r.request().url()).pathname.split('/').pop()!;
            ended.push(id);
            live.splice(0, live.length, ...live.filter((s) => (s as { id: string }).id !== id));
            return r.fulfill({ status: 204 });
        });

        await page.goto('/settings/sessions');
        await page.getByRole('button', { name: 'Sign out Safari on iPhone' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();

        await expect.poll(() => ended).toEqual([OTHER.id]);
        await expect(page.getByRole('table').getByText('Safari on iPhone')).toHaveCount(0);
        await expect(page.getByRole('table').getByText('Chrome on macOS')).toBeVisible();
        // One session left, so there is nothing else to sign out of.
        await expect(page.getByRole('button', { name: 'Sign out everywhere else' })).toHaveCount(0);
    });

    test('signing out the current row lands on the sign-in page, with no toast and no logout call', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        let ended = false;
        // After the API ends the session every authenticated call answers 401, the list read included.
        await page.route('**/api/me/sessions**', (r) => {
            if (r.request().method() === 'GET') {
                return ended
                    ? r.fulfill({ status: 401, json: { message: 'Unauthorized' } })
                    : r.fulfill({ json: pageOf([CURRENT, OTHER]) });
            }
            return r.fallback();
        });
        // Newest route wins. Until the API has ended the session the refresh works, as it does for a
        // live session; after that it answers 401, which is what an ended session gets.
        await page.route('**/api/auth/refresh', (r) =>
            ended ? r.fulfill({ status: 401, json: { message: 'Unauthorized' } }) : r.fallback()
        );
        const logoutCalls: string[] = [];
        await page.route('**/api/auth/logout', (r) => {
            logoutCalls.push(r.request().method());
            return r.fulfill({ status: 401, json: { message: 'Unauthorized' } });
        });
        await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { methods: ['password'] } }));
        await page.route('**/api/me/sessions/*', (r) => {
            if (r.request().method() !== 'DELETE') return r.fallback();
            ended = true;
            return r.fulfill({ status: 204 });
        });

        await page.goto('/settings/sessions');
        await page.getByRole('button', { name: 'Sign out Chrome on macOS' }).click();
        await expect(page.getByText('This is the session you are using now')).toBeVisible();
        await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();

        await expect(page).toHaveURL(/\/login/, { timeout: 20000 });
        await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
        expect(logoutCalls).toEqual([]);
    });

    test('a row already ended elsewhere refreshes the list with no toast', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        const live: unknown[] = [CURRENT, OTHER];
        await stubSessions(page, live);
        await page.route('**/api/me/sessions/*', (r) => {
            if (r.request().method() !== 'DELETE') return r.fallback();
            // Gone on another device before the click landed.
            live.splice(0, live.length, CURRENT);
            return r.fulfill({ status: 404, json: {} });
        });

        await page.goto('/settings/sessions');
        await page.getByRole('button', { name: 'Sign out Safari on iPhone' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();

        await expect(page.getByRole('table').getByText('Safari on iPhone')).toHaveCount(0);
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    });

    test('says when only the first 100 sessions are shown', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await page.route('**/api/me/sessions**', (r) =>
            r.fulfill({ json: { ...pageOf([CURRENT, OTHER]), hasNextPage: true } })
        );

        await page.goto('/settings/sessions');
        await expect(page.getByText('Showing the first 100 sessions.')).toBeVisible({ timeout: 20000 });
    });

    test('signs out everywhere else with one call', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        const live: unknown[] = [CURRENT, OTHER];
        await stubSessions(page, live);

        const calls: string[] = [];
        await page.route('**/api/me/sessions/revoke-others', (r) => {
            calls.push(r.request().method());
            live.splice(0, live.length, CURRENT);
            return r.fulfill({ status: 204 });
        });

        await page.goto('/settings/sessions');
        await page.getByRole('button', { name: 'Sign out everywhere else' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Sign out everywhere else' }).click();

        await expect.poll(() => calls).toEqual(['POST']);
        await expect(page.getByRole('table').getByText('Safari on iPhone')).toHaveCount(0);
    });

    test('offers the nav item when the routes answer', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await stubSessions(page, [CURRENT]);

        await page.goto('/');
        await expect(page.getByRole('link', { name: /^Sessions/ })).toBeVisible({ timeout: 20000 });
    });

    test('hides the nav item, with no error toast, when the API answers 404', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        let asked = 0;
        await page.route('**/api/me/sessions**', (r) => {
            asked++;
            return r.fulfill({ status: 404, json: {} });
        });

        await page.goto('/');
        // The rail is up once its own items are, and by then the probe has been answered.
        await expect(page.getByRole('link', { name: /^Devices/ })).toBeVisible({ timeout: 20000 });
        await expect.poll(() => asked).toBeGreaterThan(0);
        await expect(page.getByRole('link', { name: /^Sessions/ })).toHaveCount(0);
        await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    });
});
