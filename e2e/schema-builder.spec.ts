import { test, expect, type Page } from '@playwright/test';
import { authed, stubContentTypes, stubShell } from './helpers';

/**
 * The field rows of the content type builder: reordered by pointer and by keyboard, and the order
 * they end in is the order the type is created with. Field order is array order in the request, so
 * the request body is what these read.
 */

test.beforeEach(async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, []);
});

/** Records every create, and answers it. */
async function recordCreates(page: Page) {
    const bodies: { fields: { name: string }[] }[] = [];
    await page.route('**/api/content-types', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        bodies.push(route.request().postDataJSON());
        return route.fulfill({ json: { id: 'ct1', name: 'article' } });
    });
    return bodies;
}

async function startType(page: Page, fields: string[]) {
    await page.goto('/schemas/new');
    await page.getByLabel('Display name').fill('Article');
    for (const name of fields) {
        await page.getByRole('button', { name: 'Add field' }).first().click();
        const form = page.getByRole('group', { name: 'New field' });
        await form.getByLabel('Display name').fill(name);
        await form.getByRole('button', { name: 'Add field' }).click();
        await expect(form).toHaveCount(0);
    }
}

/** The field names in the order the rows show them. */
function rowNames(page: Page) {
    return page
        .getByRole('list', { name: 'Fields' })
        .getByRole('listitem')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-field-key')));
}

async function createdOrder(page: Page, bodies: { fields: { name: string }[] }[]) {
    await page.getByRole('button', { name: 'Create content type' }).click();
    await expect.poll(() => bodies.length).toBe(1);
    return bodies[0].fields.map((f) => f.name);
}

test('a field dragged by its handle onto the top of the first row becomes the first field', async ({ page }) => {
    const bodies = await recordCreates(page);
    await startType(page, ['Headline', 'Body', 'Author']);
    await expect.poll(() => rowNames(page)).toEqual(['Headline', 'Body', 'Author']);

    const rows = page.getByRole('list', { name: 'Fields' }).getByRole('listitem');
    const first = await rows.nth(0).boundingBox();
    if (!first) throw new Error('the first row has no box');
    await rows.nth(2).locator('[data-drag-handle]').dragTo(rows.nth(0), {
        targetPosition: { x: first.width / 2, y: 4 },
    });

    await expect.poll(() => rowNames(page)).toEqual(['Author', 'Headline', 'Body']);
    expect(await createdOrder(page, bodies)).toEqual(['Author', 'Headline', 'Body']);
});

test('the keyboard moves a field with the move buttons and keeps its place on the button', async ({ page }) => {
    const bodies = await recordCreates(page);
    await startType(page, ['Headline', 'Body']);

    await page.getByRole('button', { name: 'Move Body up' }).focus();
    await page.keyboard.press('Enter');

    await expect.poll(() => rowNames(page)).toEqual(['Body', 'Headline']);
    // At the top, up is disabled, so the focus is on the way back down.
    await expect(page.getByRole('button', { name: 'Move Body down' })).toBeFocused();
    await expect(page.getByText('Body moved to position 1 of 2')).toBeAttached();
    expect(await createdOrder(page, bodies)).toEqual(['Body', 'Headline']);
});

test('Enter in an open field does not create the type around it', async ({ page }) => {
    const bodies = await recordCreates(page);
    await startType(page, ['Headline']);

    await page.getByRole('button', { name: 'Edit Headline' }).click();
    const form = page.getByRole('group', { name: 'Edit Headline' });
    await form.getByLabel('Display name').fill('Headline text');
    await form.getByLabel('Display name').press('Enter');

    await expect(form).toBeVisible();
    await page.waitForTimeout(500);
    expect(bodies).toHaveLength(0);
});
