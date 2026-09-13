import { test, expect } from '@playwright/test';
import { authed, pageOf, stubContentTypes, stubShell } from './helpers';

const ID = '5f1d7c2a-3b4e-4a6f-8c9d-0e1f2a3b4c5d';

/** The menu type as the API's MenuTests models it: a Name, a Slug and an Items json field. */
const MENU_TYPE = {
    id: 'ct-menu',
    name: 'menu',
    displayName: 'Menu',
    isPubliclyDeliverable: true,
    fields: [
        { name: 'Name', displayName: 'Name', type: 'string', isRequired: true },
        { name: 'Slug', displayName: 'Slug', type: 'slug', isRequired: true },
        { name: 'Items', displayName: 'Items', type: 'json', isRequired: false },
    ],
};

async function serveMenu(page: import('@playwright/test').Page, items: unknown) {
    const saved: { data: Record<string, unknown> }[] = [];
    let entry = {
        id: ID,
        contentType: 'menu',
        data: { Name: 'Main', Slug: 'main', Items: items },
        status: 'Published',
        sensitivity: 'Public',
        version: 1,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
    };
    await page.route(`**/api/contents/${ID}`, (route) => {
        if (route.request().method() === 'PUT') {
            const body = route.request().postDataJSON();
            saved.push(body);
            entry = { ...entry, data: body.data, version: entry.version + 1 };
            return route.fulfill({ json: { id: ID, version: entry.version } });
        }
        return route.fulfill({ json: entry });
    });
    await page.route(`**/api/contents/${ID}/history**`, (route) => route.fulfill({ json: pageOf([]) }));
    return saved;
}

test.beforeEach(async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, [MENU_TYPE]);
});

test('a menu is reordered and nested from the keyboard, and saves the same shape in the new order', async ({
    page,
}) => {
    const saved = await serveMenu(page, [
        { Label: 'Blog', Url: '/blog', OpenInNewTab: false },
        {
            Label: 'Docs',
            Url: '/docs',
            OpenInNewTab: false,
            Icon: 'book',
            Children: [{ Label: 'Guide', Url: '/docs/guide' }],
        },
        { Label: 'About', Url: '/about', OpenInNewTab: false },
    ]);

    await page.goto(`/content/${ID}`);
    const up = page.getByRole('button', { name: 'Move About up' });
    await expect(up).toBeVisible({ timeout: 15000 });

    // Keyboard only. Focus stays on the item that moved, so a second Enter moves it again.
    await up.focus();
    await page.keyboard.press('Enter');
    await expect(up).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(up).toBeDisabled();

    await page.getByRole('button', { name: 'Move Guide out of Docs' }).focus();
    await page.keyboard.press('Enter');

    await page.getByRole('button', { name: 'Nest Blog under About' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Move Blog out of About' })).toBeFocused();

    await page.getByRole('button', { name: /save changes/i }).click();
    await expect.poll(() => saved.length).toBe(1);

    expect(saved[0].data).toEqual({
        Name: 'Main',
        Slug: 'main',
        Items: [
            {
                Label: 'About',
                Url: '/about',
                OpenInNewTab: false,
                Children: [{ Label: 'Blog', Url: '/blog', OpenInNewTab: false }],
            },
            { Label: 'Docs', Url: '/docs', OpenInNewTab: false, Icon: 'book', Children: [] },
            { Label: 'Guide', Url: '/docs/guide' },
        ],
    });
});

test('a menu the list cannot show is left as JSON, untouched', async ({ page }) => {
    const deep = [{ Label: 'A', Url: '/a', Children: [{ Label: 'B', Url: '/b', Children: [{ Label: 'C', Url: '/c' }] }] }];
    const saved = await serveMenu(page, deep);

    await page.goto(`/content/${ID}`);
    const textarea = page.locator('textarea#Items');
    await expect(textarea).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/not a menu the list can show/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit as a list' })).toBeDisabled();

    await page.getByLabel(/Name/).first().fill('Main nav');
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0].data.Items).toEqual(deep);
});
