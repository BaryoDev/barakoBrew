import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { authed, stubShell, pageOf } from './helpers';
import { SUPPORTED_CONTRACT } from '../src/lib/api-contract';

const ME = '00000000-0000-0000-0000-000000000001';
const ANA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BEN = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const NOW = Date.now();

const session = (id: string, device: string) => ({
    id,
    device,
    signInMethod: 'password',
    signInIp: '203.0.113.24',
    lastSeenIp: '203.0.113.25',
    startedAt: new Date(NOW - 3600_000).toISOString(),
    lastSeenAt: new Date(NOW - 60_000).toISOString(),
    current: false,
});

const S1 = session('11111111-1111-1111-1111-111111111111', 'Chrome on Windows');
const S2 = session('22222222-2222-2222-2222-222222222222', 'Firefox on Linux');

const user = (id: string, username: string, blocked?: boolean) => ({
    id,
    username,
    email: `${username}@example.com`,
    roleIds: [],
    groupIds: [],
    createdAt: '2026-09-01T00:00:00Z',
    ...(blocked ? { blocked: true } : {}),
});

/** A token for a signed-in Admin, who is not a SuperAdmin. */
function adminToken() {
    const payload = Buffer.from(
        JSON.stringify({
            UserId: ME,
            Username: 'admin',
            tenant: 'default',
            'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': ['Admin'],
        })
    ).toString('base64url');
    return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
}

async function stubUsers(page: Page, users: ReturnType<typeof user>[]) {
    await page.route(/\/api\/users(\?|$)/, (r) => r.fulfill({ json: pageOf(users) }));
    await page.route('**/api/roles**', (r) => r.fulfill({ json: pageOf([]) }));
    await page.route('**/api/user-groups**', (r) => r.fulfill({ json: pageOf([]) }));
    // The rail's probe for the caller's own sessions. Answered, so the action is offered.
    await page.route('**/api/me/sessions**', (r) => r.fulfill({ json: pageOf([]) }));
}

test.describe('users: sessions and blocking', () => {
    test('the panel lists a user\'s sessions, and sign out everywhere empties it', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await stubUsers(page, [user(ANA, 'ana'), user(BEN, 'ben')]);

        const live = [S1, S2];
        await page.route(`**/api/users/${ANA}/sessions`, (r) => {
            if (r.request().method() === 'DELETE') {
                live.length = 0;
                return r.fulfill({ status: 204 });
            }
            return r.fulfill({ json: pageOf(live) });
        });

        await page.goto('/users');
        await page.getByRole('button', { name: 'Sessions for ana' }).click();

        const panel = page.getByRole('dialog', { name: 'Sessions for ana' });
        await expect(panel.getByText('Chrome on Windows')).toBeVisible({ timeout: 20000 });
        await expect(panel.getByText('Firefox on Linux')).toBeVisible();

        await panel.getByRole('button', { name: 'Sign out everywhere' }).click();
        await page.getByRole('dialog', { name: 'Sign out everywhere?' }).getByRole('button', { name: 'Confirm sign out' }).click();

        await expect(panel.getByText('This account is not signed in anywhere.')).toBeVisible();
        await expect(panel.getByText('Chrome on Windows')).toHaveCount(0);
    });

    test('signing out one row of the panel names that session', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await stubUsers(page, [user(ANA, 'ana')]);

        const live = [S1, S2];
        await page.route(`**/api/users/${ANA}/sessions`, (r) => r.fulfill({ json: pageOf(live) }));
        const ended: string[] = [];
        await page.route(`**/api/users/${ANA}/sessions/*`, (r) => {
            const id = new URL(r.request().url()).pathname.split('/').pop()!;
            ended.push(id);
            live.splice(0, live.length, ...live.filter((s) => s.id !== id));
            return r.fulfill({ status: 204 });
        });

        await page.goto('/users');
        await page.getByRole('button', { name: 'Sessions for ana' }).click();
        const panel = page.getByRole('dialog', { name: 'Sessions for ana' });
        await panel.getByRole('button', { name: 'Sign out Firefox on Linux' }).click();

        await expect.poll(() => ended).toEqual([S2.id]);
        await expect(panel.getByText('Firefox on Linux')).toHaveCount(0);
        await expect(panel.getByText('Chrome on Windows')).toBeVisible();
    });

    test('shows the standard message when the sessions are refused with 403', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await stubUsers(page, [user(ANA, 'ana')]);
        await page.route(`**/api/users/${ANA}/sessions`, (r) =>
            r.fulfill({ status: 403, json: { errors: ['Only a platform administrator (SuperAdmin) can manage another user\'s sessions.'] } })
        );

        await page.goto('/users');
        await page.getByRole('button', { name: 'Sessions for ana' }).click();

        const panel = page.getByRole('dialog', { name: 'Sessions for ana' });
        await expect(panel.getByText('You do not have permission to do that.')).toBeVisible({ timeout: 20000 });
        await expect(panel.getByText(/Couldn.t load sessions/)).toHaveCount(0);
    });

    test('a user deleted since the list loaded closes the panel and says so', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        let listReads = 0;
        await page.route(/\/api\/users(\?|$)/, (r) => {
            listReads++;
            return r.fulfill({ json: pageOf(listReads === 1 ? [user(ANA, 'ana')] : []) });
        });
        await page.route('**/api/roles**', (r) => r.fulfill({ json: pageOf([]) }));
        await page.route('**/api/user-groups**', (r) => r.fulfill({ json: pageOf([]) }));
        await page.route('**/api/me/sessions**', (r) => r.fulfill({ json: pageOf([]) }));
        await page.route(`**/api/users/${ANA}/sessions`, (r) => r.fulfill({ status: 404, json: {} }));

        await page.goto('/users');
        await page.getByRole('button', { name: 'Sessions for ana' }).click();

        await expect(page.getByText('That account no longer exists.')).toBeVisible({ timeout: 20000 });
        await expect(page.getByRole('dialog')).toHaveCount(0);
        // The stale row is gone because the list was read again.
        await expect(page.getByRole('button', { name: 'Sessions for ana' })).toHaveCount(0);
        expect(listReads).toBeGreaterThan(1);
    });

    test('says when only the first 100 of a user\'s sessions are shown', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await stubUsers(page, [user(ANA, 'ana')]);
        await page.route(`**/api/users/${ANA}/sessions`, (r) =>
            r.fulfill({ json: { ...pageOf([S1]), hasNextPage: true } })
        );

        await page.goto('/users');
        await page.getByRole('button', { name: 'Sessions for ana' }).click();
        await expect(page.getByText('Showing the first 100 sessions.')).toBeVisible({ timeout: 20000 });
    });

    for (const action of ['block', 'unblock'] as const) {
        test(`an unknown user answered 404 on ${action} says so and keeps the actions`, async ({ page }) => {
            await authed(page);
            await stubShell(page);
            const listed = action === 'unblock' ? user(ANA, 'ana', true) : user(ANA, 'ana');
            const other = user(BEN, 'ben');
            let reads = 0;
            await page.route(/\/api\/users(\?|$)/, (r) => {
                reads++;
                // The target is deleted by the time the list is read again.
                return r.fulfill({ json: pageOf(reads === 1 ? [listed, other] : [other]) });
            });
            await page.route('**/api/roles**', (r) => r.fulfill({ json: pageOf([]) }));
            await page.route('**/api/user-groups**', (r) => r.fulfill({ json: pageOf([]) }));
            await page.route('**/api/me/sessions**', (r) => r.fulfill({ json: pageOf([]) }));
            await page.route(/\/api\/users\/[^/]+\/(block|unblock)$/, (r) =>
                r.fulfill({
                    status: 404,
                    json: { statusCode: 404, message: 'One or more errors occurred!', errors: { generalErrors: ['No account has that id.'] } },
                }),
            );

            await page.goto('/users');
            const label = action === 'block' ? 'Block ana' : 'Unblock ana';
            await page.getByRole('button', { name: label }).click();
            await page.getByRole('button', { name: action === 'block' ? 'Confirm block' : 'Confirm unblock' }).click();

            await expect(page.getByText('That account no longer exists.')).toBeVisible({ timeout: 20000 });
            // The route exists, so the actions of the user who is still there stay.
            await expect(page.getByRole('button', { name: 'Block ben' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Sessions for ben' })).toBeVisible();
        });
    }

    test('block shows the badge and unblock clears it, each after a confirm step', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        const users = [user(ANA, 'ana'), user(BEN, 'ben')];
        await page.route(/\/api\/users(\?|$)/, (r) => r.fulfill({ json: pageOf(users) }));
        await page.route('**/api/roles**', (r) => r.fulfill({ json: pageOf([]) }));
        await page.route('**/api/user-groups**', (r) => r.fulfill({ json: pageOf([]) }));
        await page.route('**/api/me/sessions**', (r) => r.fulfill({ json: pageOf([]) }));

        const calls: string[] = [];
        await page.route(/\/api\/users\/[^/]+\/(block|unblock)$/, (r) => {
            const path = new URL(r.request().url()).pathname;
            calls.push(`${r.request().method()} ${path}`);
            const target = users.find((u) => path.includes(u.id))!;
            if (path.endsWith('/unblock')) delete (target as { blocked?: boolean }).blocked;
            else (target as { blocked?: boolean }).blocked = true;
            return r.fulfill({ status: 200, json: {} });
        });

        await page.goto('/users');
        await expect(page.getByText('Blocked', { exact: true })).toHaveCount(0, { timeout: 20000 });

        await page.getByRole('button', { name: 'Block ana' }).click();
        await expect(page.getByText('cannot sign in, their sessions end')).toBeVisible();
        // Nothing is sent until the confirm.
        expect(calls).toEqual([]);
        await page.getByRole('button', { name: 'Confirm block' }).click();

        await expect(page.getByText('Blocked', { exact: true })).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Unblock ana' })).toBeVisible();

        await page.getByRole('button', { name: 'Unblock ana' }).click();
        await page.getByRole('button', { name: 'Confirm unblock' }).click();

        await expect(page.getByText('Blocked', { exact: true })).toHaveCount(0);
        expect(calls).toEqual([`POST /api/users/${ANA}/block`, `POST /api/users/${ANA}/unblock`]);
    });

    test('shows the API\'s refusal when blocking a SuperAdmin is answered 403', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await stubUsers(page, [user(ANA, 'ana')]);
        await page.route(/\/api\/users\/[^/]+\/block$/, (r) =>
            r.fulfill({ status: 403, json: { errors: ['A SuperAdmin cannot be blocked.'] } })
        );

        await page.goto('/users');
        await page.getByRole('button', { name: 'Block ana' }).click();
        await page.getByRole('button', { name: 'Confirm block' }).click();

        await expect(page.getByText('A SuperAdmin cannot be blocked.')).toBeVisible();
        await expect(page.getByText('Blocked', { exact: true })).toHaveCount(0);
    });

    test('offers no block action on your own account', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await stubUsers(page, [user(ME, 'admin'), user(ANA, 'ana')]);

        await page.goto('/users');
        await expect(page.getByRole('button', { name: 'Block ana' })).toBeVisible({ timeout: 20000 });
        await expect(page.getByRole('button', { name: 'Block admin' })).toHaveCount(0);
        // Your own sessions are on the Sessions page, which runs the sign-out flow for the current one.
        await expect(page.getByRole('button', { name: 'Sessions for admin' })).toHaveCount(0);
    });

    test('hides the sessions action, with no toast, when the API has no session routes', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await stubUsers(page, [user(ANA, 'ana')]);
        await page.route('**/api/me/sessions**', (r) => r.fulfill({ status: 404, json: {} }));

        await page.goto('/users');
        await expect(page.getByRole('button', { name: 'Block ana' })).toBeVisible({ timeout: 20000 });
        await expect(page.getByRole('button', { name: 'Sessions for ana' })).toHaveCount(0);
        await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    });

    test('hides the block actions, with no toast, when the API has no block route', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await stubUsers(page, [user(ANA, 'ana')]);
        // No body: the API has no block route.
        await page.route(/\/api\/users\/[^/]+\/block$/, (r) => r.fulfill({ status: 404, body: '' }));

        await page.goto('/users');
        await page.getByRole('button', { name: 'Block ana' }).click();
        await page.getByRole('button', { name: 'Confirm block' }).click();

        await expect(page.getByRole('button', { name: 'Block ana' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Sessions for ana' })).toBeVisible();
        await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    });

    test('a caller who is not a SuperAdmin sees none of these actions', async ({ page }) => {
        const token = adminToken();
        await page.route('**/api/auth/refresh', (r) =>
            r.fulfill({
                headers: {
                    'x-api-contract-version': String(SUPPORTED_CONTRACT.min),
                    'access-control-expose-headers': 'ETag,X-Api-Contract-Version',
                },
                json: {
                    token,
                    expiry: new Date(Date.now() + 900_000).toISOString(),
                    refreshToken: 'mock-refresh',
                    refreshTokenExpiry: new Date(Date.now() + 7 * 86400_000).toISOString(),
                },
            })
        );
        await stubShell(page);
        await stubUsers(page, [user(ANA, 'ana', true)]);

        await page.goto('/users');
        // The row is there, and the badge, but no action on it.
        await expect(page.getByText('ana', { exact: true })).toBeVisible({ timeout: 20000 });
        await expect(page.getByText('Blocked', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Sessions for ana' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^(Block|Unblock) ana$/ })).toHaveCount(0);
    });
});
