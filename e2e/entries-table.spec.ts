import { test, expect } from '@playwright/test';
import { authed, stubContentTypes, stubShell } from './helpers';

/**
 * The entries table follows what the server hands it.
 *
 * React Compiler is on in this build and the unit pack does not run it. A table library that keeps
 * one instance across renders can leave memoised rows on screen when only the data under it
 * changed, which no jsdom test would see. So this pages and filters in the browser and reads rows.
 */

const BLOG = {
    name: 'blogpost',
    displayName: 'Blog posts',
    isSingleton: false,
    isPubliclyDeliverable: true,
    fields: [{ name: 'Title', displayName: 'Title', type: 'string', isRequired: true }],
};

function entry(n: number, status: string) {
    return {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        contentType: 'blogpost',
        data: { Title: `Entry ${n}` },
        status,
        sensitivity: 'Public',
        version: n,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-02T00:00:00Z',
    };
}

const ALL = [entry(1, 'Draft'), entry(2, 'Published'), entry(3, 'Draft'), entry(4, 'Published')];

test.beforeEach(async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, [BLOG]);
    // Two rows a page, so the second page holds rows the first never showed.
    await page.route(/\/api\/contents(\?|$)/, (route) => {
        const params = new URL(route.request().url()).searchParams;
        const status = params.get('status');
        const pageNumber = Number(params.get('page') ?? '1');
        const matching = status ? ALL.filter((e) => e.status === status) : ALL;
        const totalPages = Math.ceil(matching.length / 2);
        return route.fulfill({
            json: {
                items: matching.slice((pageNumber - 1) * 2, pageNumber * 2),
                page: pageNumber,
                pageSize: 2,
                totalItems: matching.length,
                totalPages,
                hasNextPage: pageNumber < totalPages,
                hasPreviousPage: pageNumber > 1,
            },
        });
    });
});

function rows(page: import('@playwright/test').Page) {
    return page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') });
}

test('the next page replaces the rows rather than keeping the first page on screen', async ({ page }) => {
    await page.goto('/content');

    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0)).toContainText('Entry 1');
    await expect(rows(page).nth(1)).toContainText('Entry 2');

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForURL(/page=2/);

    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0)).toContainText('Entry 3');
    await expect(rows(page).nth(1)).toContainText('Entry 4');
    await expect(page.getByRole('link', { name: 'Entry 1' })).toHaveCount(0);
});

test('a status filter redraws every cell of every row, the version column included', async ({ page }) => {
    await page.goto('/content');
    await expect(rows(page)).toHaveCount(2);

    await page.getByRole('radio', { name: 'Published' }).click();
    await page.waitForURL(/status=Published/);

    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0)).toContainText('Entry 2');
    await expect(rows(page).nth(1)).toContainText('Entry 4');
    for (const row of await rows(page).all()) {
        await expect(row).toContainText('Published');
        await expect(row).not.toContainText('Draft');
    }
    // The version column is display:none below md, so it is out of the accessibility tree on a phone
    // project; the cell is still rendered, and it is the rendered cell that has to be redrawn.
    await expect(rows(page).nth(1).locator('td').nth(3)).toHaveText('4');
});
