import { test, expect } from '@playwright/test';
import { authed, stubShell, stubContentTypes, pageOf, ALL_MODULES } from './helpers';

/**
 * The rail's counts and badges.
 *
 * The point of these is not that a number appears. It is that the number is the API's and nothing
 * else. A placeholder count in the chrome is worse than no count, because it looks authoritative
 * and nobody goes back to check it, so both halves are asserted: the figure the API stated shows,
 * and a response with no figure shows nothing at all.
 */

const envelope = (totalItems: number) => ({
    items: [],
    page: 1,
    pageSize: 1,
    totalItems,
    totalPages: totalItems,
    hasNextPage: totalItems > 1,
    hasPreviousPage: false,
});

/** The rail itself. Scoped because the header's breadcrumb offers links by the same names. */
const rail = (page: import('@playwright/test').Page) => page.locator('[data-slot="sidebar"]');

async function landOnAnAdminPage(page: import('@playwright/test').Page) {
    await page.goto('/api-keys');
    await expect(page.getByRole('heading', { name: 'API keys' })).toBeVisible({ timeout: 15000 });
}

// The rail is a sheet below the md breakpoint, closed until it is opened, and a phone has no Tab
// key. These assert the desktop rail; the sheet is the shadcn component's own behaviour.
test.beforeEach(({ isMobile }) => {
    test.skip(!!isMobile, 'the rail is a sheet on a phone, and these assert the desktop rail');
});

test('counts and badges show the figures the API reported', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, []);
    await page.route('**/api/contents**', (r) => r.fulfill({ json: envelope(148) }));
    await page.route(/\/api\/content-types(\?|$)/, (r) => r.fulfill({ json: envelope(6) }));
    await page.route('**/api/workflows**', (r) => r.fulfill({ json: envelope(3) }));
    await page.route('**/api/client-errors**', (r) => r.fulfill({ json: envelope(4) }));
    await page.route('**/api/email-events**', (r) =>
        r.fulfill({
            json: [
                { at: new Date().toISOString() },
                { at: new Date().toISOString() },
                // Outside the 24 hour window, so it must not be counted.
                { at: new Date(Date.now() - 5 * 86400_000).toISOString() },
            ],
        })
    );

    await landOnAnAdminPage(page);

    const nav = rail(page);
    await expect(nav.getByRole('link', { name: 'Entries 148' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Content types 6' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Workflows 3' })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Errors 4 unresolved/ })).toBeVisible();
    await expect(
        nav.getByRole('link', { name: /Email events 2 bounced in the last 24 hours/ })
    ).toBeVisible();
});

test('an item whose count has no source shows no number', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, []);
    // A response with no total is what an older module returning a bare array looks like. The rail
    // must not invent a figure from it, and must not fall back to the row count either.
    await page.route('**/api/contents**', (r) => r.fulfill({ json: [{ id: 'a' }, { id: 'b' }] }));
    await page.route('**/api/workflows**', (r) => r.fulfill({ status: 500, json: { message: 'boom' } }));
    // Content types answers properly, and is the gate below. Without it this test passes on the
    // first paint, before any count has arrived, and would pass just as well against a rail that
    // does invent a figure a moment later.
    await page.route(/\/api\/content-types(\?|$)/, (r) => r.fulfill({ json: envelope(6) }));

    await landOnAnAdminPage(page);

    const nav = rail(page);
    await expect(nav.getByRole('link', { name: 'Content types 6' })).toBeVisible();

    // Present and reachable, just not carrying a number. Asserted as an exact accessible name, so
    // "Entries 2" taken from the row count would fail here rather than pass as a near miss.
    await expect(nav.getByRole('link', { name: 'Entries', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Workflows', exact: true })).toBeVisible();
});

test('the rail is reachable by keyboard from the search field', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, []);

    await landOnAnAdminPage(page);

    await rail(page).getByRole('button', { name: /Search or jump to/ }).focus();
    await page.keyboard.press('Tab');
    await expect(rail(page).getByRole('link', { name: 'Overview' })).toBeFocused();
});

/**
 * The Modules group, from GET /api/modules rather than from a fixed list.
 *
 * Three states, and the two that are not the happy one matter more. A rail that empties while the
 * request is in flight, or because the request failed, is worse than a rail that offers a screen the
 * deployment turns out not to serve: the screens themselves still say so on arrival, and a rail that
 * flickers is one nobody can trust to be complete.
 */
test('the rail leaves out an item for a module the API does not run', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, []);
    // Accounting installed and switched off, Files not installed at all. Both are screens this
    // deployment does not serve.
    await page.route(/\/api\/modules(\?|$)/, (r) =>
        r.fulfill({
            json: pageOf(
                ALL_MODULES.filter((m) => m.name !== 'Files').map((m) =>
                    m.name === 'Accounting' ? { ...m, enabled: false } : m
                )
            ),
        })
    );

    await landOnAnAdminPage(page);

    const nav = rail(page);
    // The gate. Without it the three absences below pass on a rail that has not rendered yet.
    await expect(nav.getByRole('link', { name: 'Analytics' })).toBeVisible();

    await expect(nav.getByRole('link', { name: 'Accounting' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Files' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'PWA installs' })).toBeVisible();
});

test('the rail shows every module item until the answer arrives, then drops what is gone', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, []);

    let release: () => void = () => {};
    const answered = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route(/\/api\/modules(\?|$)/, async (r) => {
        await answered;
        await r.fulfill({ json: pageOf(ALL_MODULES.filter((m) => m.name !== 'Files')) });
    });

    await landOnAnAdminPage(page);

    // In flight. The fixed list is what the rail shows, which is what it showed before this
    // endpoint was read at all.
    const nav = rail(page);
    await expect(nav.getByRole('link', { name: 'Files' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Accounting' })).toBeVisible();

    release();

    // And the same assertion the other way once the API has spoken, so the line above is a
    // statement about waiting rather than about a rail that never filters anything.
    await expect(nav.getByRole('link', { name: 'Files' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Accounting' })).toBeVisible();
});

test('a rail that cannot read the module list keeps every item', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, []);
    // GET /api/modules needs SuperAdmin or Admin. An Accountant is refused, and must still be
    // offered the accounting screen: the API decides what it serves, and it has said nothing.
    await page.route(/\/api\/modules(\?|$)/, (r) => r.fulfill({ status: 403, json: { message: 'no' } }));

    await landOnAnAdminPage(page);

    const nav = rail(page);
    await expect(nav.getByRole('link', { name: 'Accounting' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Files' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'PWA installs' })).toBeVisible();
});
