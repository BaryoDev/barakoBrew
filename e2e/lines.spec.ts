import { test, expect, type Page } from '@playwright/test';
import { authed, pageOf, stubContentTypes, stubShell } from './helpers';

/**
 * Lines on a content type: set on the type screen, entered with a new entry, and read back on the
 * entry's own page. The API is stubbed, so the request bodies are what these read.
 */

const ID = '5d0f3c2a-1b7e-4c8a-9f10-2a6b7c8d9e01';

const ORDER = {
    name: 'order',
    displayName: 'Order',
    fields: [
        { name: 'Title', displayName: 'Title', type: 'string', isRequired: false },
        { name: 'Total', displayName: 'Total', type: 'decimal', isRequired: false },
    ],
};

const ORDER_LINE = {
    name: 'orderline',
    displayName: 'Order line',
    fields: [
        { name: 'Order', displayName: 'Order', type: 'reference', referenceType: 'order', isRequired: false },
        { name: 'Item', displayName: 'Item', type: 'string', isRequired: false },
        { name: 'Amount', displayName: 'Amount', type: 'decimal', isRequired: false },
    ],
};

const LINES = { contentType: 'orderline', parentField: 'Order', totalField: 'Total', lineAmountField: 'Amount' };

function entry(id: string, contentType: string, data: Record<string, unknown>) {
    return {
        id,
        contentType,
        data,
        status: 'Published',
        sensitivity: 'Public',
        version: 1,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
    };
}

/** Serves the type list from memory, so a saved set of lines is there on the next read. */
async function serveTypes(page: Page, order: Record<string, unknown>) {
    let current = order;
    await page.route(/\/api\/content-types(\?|$)/, (route) => route.fulfill({ json: pageOf([current, ORDER_LINE]) }));
    return {
        set(next: Record<string, unknown>) {
            current = next;
        },
    };
}

test.beforeEach(async ({ page }) => {
    await authed(page, 12);
    await stubShell(page);
    await stubContentTypes(page, [ORDER, ORDER_LINE]);
});

test('lines are set on the type screen with the total and the amount together', async ({ page }) => {
    const types = await serveTypes(page, ORDER);
    const bodies: unknown[] = [];
    await page.route('**/api/content-types/order/lines', (route) => {
        bodies.push(route.request().postDataJSON());
        types.set({ ...ORDER, lines: LINES });
        return route.fulfill({ json: { name: 'order', lines: LINES } });
    });

    await page.goto('/schemas/order');
    await expect(page.getByText('No lines.')).toBeVisible();
    await page.getByRole('button', { name: 'Set lines' }).click();

    const dialog = page.getByRole('dialog', { name: /Lines for Order/ });
    await dialog.getByRole('combobox', { name: 'Line type' }).click();
    await page.getByRole('option', { name: 'Order line' }).click();
    await dialog.getByRole('combobox', { name: 'Field that points back' }).click();
    await page.getByRole('option', { name: 'Order', exact: true }).click();

    await dialog.getByRole('combobox', { name: 'Total field' }).click();
    await page.getByRole('option', { name: 'Total', exact: true }).click();
    // One of the two alone is not sent.
    await expect(dialog.getByRole('button', { name: 'Save lines' })).toBeDisabled();
    await dialog.getByRole('combobox', { name: 'Line amount field' }).click();
    await page.getByRole('option', { name: 'Amount', exact: true }).click();

    await dialog.getByRole('button', { name: 'Save lines' }).click();

    await expect.poll(() => bodies).toEqual([{ lines: LINES }]);
    await expect(page.getByText(/Total has to equal the sum of Amount/)).toBeVisible();
});

test('an entry is created with its lines, and its page lists them', async ({ page }) => {
    await serveTypes(page, { ...ORDER, lines: LINES });
    const posted: { contentType: string; data: Record<string, unknown>; lines?: Record<string, unknown>[] }[] = [];
    await page.route(/\/api\/contents(\?|$)/, (route) => {
        if (route.request().method() !== 'POST') return route.fulfill({ json: pageOf([]) });
        posted.push(route.request().postDataJSON());
        return route.fulfill({ json: { id: ID, version: 1 } });
    });
    await page.route(`**/api/contents/${ID}`, (route) =>
        route.fulfill({ json: entry(ID, 'order', { Title: 'First order', Total: 4 }) }),
    );
    await page.route(`**/api/contents/${ID}/history`, (route) => route.fulfill({ json: pageOf([]) }));
    await page.route(`**/api/contents/${ID}/lines`, (route) =>
        route.fulfill({
            json: {
                header: entry(ID, 'order', { Title: 'First order', Total: 4 }),
                truncated: false,
                lines: [
                    entry('l-1', 'orderline', { Order: ID, Item: 'Tea', Amount: 2.5 }),
                    entry('l-2', 'orderline', { Order: ID, Item: 'Cake', Amount: 1.5 }),
                ],
            },
        }),
    );

    await page.goto('/content/new?type=order');
    await page.getByLabel('Title', { exact: true }).fill('First order');
    await page.getByLabel('Total', { exact: true }).fill('3');

    await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByLabel('Item, line 1').fill('Tea');
    await page.getByLabel('Amount, line 1').fill('2.5');
    await page.getByLabel('Item, line 2').fill('Cake');
    await page.getByLabel('Amount, line 2').fill('1.5');

    // The total entered is 3 and the lines add up to 4: warned before the save, not blocked.
    await expect(page.getByRole('status')).toContainText('Total is 3, but the lines add up to 4');
    await page.getByLabel('Total', { exact: true }).fill('4');
    await expect(page.getByRole('status')).toHaveCount(0);

    await page.getByRole('button', { name: 'Publish' }).click();

    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].contentType).toBe('order');
    expect(posted[0].data).toEqual({ Title: 'First order', Total: 4 });
    expect(posted[0].lines).toEqual([
        { Item: 'Tea', Amount: 2.5 },
        { Item: 'Cake', Amount: 1.5 },
    ]);

    await page.waitForURL(`**/content/${ID}`);
    const lines = page.getByRole('region', { name: 'Order line' });
    await expect(lines.getByRole('link', { name: 'Open line 1' })).toHaveAttribute('href', '/content/l-1');
    await expect(lines.getByRole('link', { name: 'Open line 2' })).toHaveAttribute('href', '/content/l-2');
    await expect(lines.getByRole('cell', { name: 'Tea' })).toBeVisible();
    await expect(lines.getByRole('cell', { name: 'Cake' })).toBeVisible();
});
