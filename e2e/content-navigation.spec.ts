import { test, expect } from '@playwright/test';
import { authed, pageOf, stubContentTypes, stubShell } from './helpers';

/**
 * The path an editor with no API knowledge takes: content types, a type, an entry, and back.
 *
 * Every step of it used to lead somewhere else. A content type card opened the field designer, the
 * way back from an entry went to every entry in the CMS rather than to the type it came from, and
 * the header of the entry screen read the entry's uuid.
 */

const ID = '4f6c2a90-1b2c-4d3e-8f90-a1b2c3d4e5f6';

const BLOG = {
    name: 'blogpost',
    displayName: 'Blog posts',
    description: 'Posts on the site',
    isSingleton: false,
    isPubliclyDeliverable: true,
    updatedAt: '2026-09-01T00:00:00Z',
    fields: [
        { name: 'Title', displayName: 'Title', type: 'string', isRequired: true },
        { name: 'Body', displayName: 'Body', type: 'markdown', isRequired: false },
    ],
};

const PRODUCT = {
    name: 'product',
    displayName: 'Products',
    isSingleton: false,
    fields: [{ name: 'Name', displayName: 'Name', type: 'string', isRequired: true }],
};

const ENTRY = {
    id: ID,
    contentType: 'blogpost',
    data: { Title: 'Hello world', Body: '# Hi' },
    status: 'Draft',
    sensitivity: 'Public',
    version: 3,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-02T00:00:00Z',
};

test.beforeEach(async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, [BLOG, PRODUCT]);
    await page.route(/\/api\/contents(\?|$)/, (route) => {
        const type = new URL(route.request().url()).searchParams.get('contentType');
        return route.fulfill({ json: pageOf(type === 'product' ? [] : [ENTRY]) });
    });
    await page.route(`**/api/contents/${ID}`, (route) => route.fulfill({ json: ENTRY }));
    await page.route(`**/api/contents/${ID}/history**`, (route) => route.fulfill({ json: pageOf([]) }));
});

test('a content type opens its entries, an entry opens from there, and both lead back', async ({ page, isMobile }) => {
    await page.goto('/schemas');

    // The type's name is a link, so Enter on it is the whole interaction. A row that needed a mouse,
    // or a second click in the detail, would fail here rather than in a report nobody reads.
    const row = page.getByRole('link', { name: /^Blog posts/ });
    await expect(row).toBeVisible();
    await row.focus();
    await page.keyboard.press('Enter');

    await page.waitForURL('**/content?type=blogpost');
    await expect(page.getByRole('heading', { name: 'Blog posts' })).toBeVisible();

    await page.getByRole('link', { name: 'Hello world' }).click();
    await page.waitForURL(`**/content/${ID}`);

    // The screen names the entry, and so does the crumb above it. This is the assertion the raw
    // uuid used to fail. A phone shows "{tenant} / {screen}" in the top bar instead of the crumbs.
    const crumbs = isMobile ? page.getByLabel('Where you are') : page.locator('[data-slot="breadcrumb"]');
    await expect(crumbs).toContainText('Hello world');
    await expect(crumbs).not.toContainText(ID);

    await page.getByRole('button', { name: 'Back to Blog posts' }).click();
    await page.waitForURL('**/content?type=blogpost');

    await page.getByRole('link', { name: 'Content types' }).first().click();
    await page.waitForURL('**/schemas');
    await expect(page.getByRole('link', { name: /^Blog posts/ })).toBeVisible();
});

test('the entries of a type are in the URL, so the same link opens the same screen', async ({ page }) => {
    await page.goto('/content?type=blogpost&status=Draft&q=hello');

    await expect(page.getByLabel('Search entries')).toHaveValue('hello');
    await expect(page.getByRole('heading', { name: 'Blog posts' })).toBeVisible();

    // Typing settles into the URL rather than staying in the component, which is what makes the
    // screen linkable at all.
    await page.getByLabel('Search entries').fill('world');
    await page.waitForURL(/q=world/);
    expect(new URL(page.url()).searchParams.get('type')).toBe('blogpost');
});

test('the Entries link in the rail clears a search rather than restoring it', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'the rail is a sheet on a phone, and this reaches the screen from the rail');

    // Same route, different query string, so the screen stays mounted and the search box has to
    // follow the URL. It used to win the argument and write its own value straight back, which
    // made the rail's Entries link look broken.
    await page.goto('/content?type=blogpost&q=hello');
    await expect(page.getByLabel('Search entries')).toHaveValue('hello');

    await page.locator('a[data-sidebar="menu-button"][href="/content"]').click();

    await expect(page.getByLabel('Search entries')).toHaveValue('');
    await expect
        .poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 5000 })
        .toBeNull();
});

test('the content types screen fits a phone without sideways scrolling', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'this is the phone-width check; the desktop projects have room');

    await page.goto('/schemas');
    await expect(page.getByRole('link', { name: /^Blog posts/ })).toBeVisible();

    const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflows).toBe(false);
});
