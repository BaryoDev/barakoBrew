import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { authed, stubShell, stubContentTypes, pageOf } from './helpers';

/**
 * The two ways an entry holds an image, each saved through the real create flow against the mocked
 * API, and each checked by the exact value the entry is saved with: a `file` field keeps the id of a
 * stored file, uploaded from the field or picked from Files, and an `inlineimage` field keeps a data
 * URI and its alt text in the entry itself.
 */

const PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG = { name: 'harbour.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') };

const UPLOADED_ID = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';
const EXISTING_ID = '7a9619ff-8b86-d011-b42d-00cf4fc964aa';

const SCHEMA = {
    id: 'ct-img',
    name: 'story',
    displayName: 'Story',
    fields: [
        { name: 'Title', displayName: 'Title', type: 'string', isRequired: true },
        { name: 'Cover', displayName: 'Cover', type: 'file', editor: 'image', isRequired: false },
        { name: 'Badge', displayName: 'Badge', type: 'inlineimage', isRequired: false },
    ],
};

async function gotoNewStory(page: Page) {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, [SCHEMA]);
    await page.route(/\/api\/files(\?|$)/, (r) => {
        if (r.request().method() === 'POST') {
            return r.fulfill({
                json: { id: UPLOADED_ID, fileName: 'harbour.png', contentType: 'image/png', size: PNG.buffer.length, isPublic: false, publicUrl: null },
            });
        }
        return r.fulfill({
            json: pageOf(
                [
                    { id: EXISTING_ID, fileName: 'jetty.png', contentType: 'image/png', size: 1, isPublic: true, publicUrl: null, alt: 'A jetty', caption: null, uploadedBy: 'u', createdAt: '2026-10-01T00:00:00Z' },
                ],
                20
            ),
        });
    });
    await page.route(/\/api\/public\/files\/.*/, (r) => r.fulfill({ body: PNG.buffer, contentType: 'image/png' }));
    // A private file's thumbnail, which comes through the API client from the authenticated route.
    await page.route(/\/api\/files\/[0-9a-f-]{36}\?/, (r) => r.fulfill({ body: PNG.buffer, contentType: 'image/png' }));
    await page.goto('/content/new?type=story');
    await expect(page.locator('#Title')).toBeVisible({ timeout: 15000 });
    await page.locator('#Title').fill('Harbour');
}

/** Saves as a draft and returns the body the create call carried. */
async function saveDraft(page: Page) {
    let created: { data: Record<string, unknown> } | null = null;
    await page.route(/\/api\/contents(\?|$)/, (r) => {
        if (r.request().method() === 'POST') {
            created = r.request().postDataJSON();
            return r.fulfill({ json: { id: 'new-story', version: 1 } });
        }
        return r.fulfill({ json: pageOf([]) });
    });
    await page.route(/\/api\/contents\/new-story$/, (r) =>
        r.fulfill({ json: { id: 'new-story', contentType: 'story', data: {}, status: 'Draft', version: 1 } })
    );
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect.poll(() => created).not.toBeNull();
    return created!;
}

test('file mode: an image uploaded from the field, with its alt text, is saved as its file id', async ({ page }) => {
    await gotoNewStory(page);
    let alt: unknown = null;
    await page.route(new RegExp(`/api/files/${UPLOADED_ID}$`), (r) => {
        alt = r.request().postDataJSON();
        return r.fulfill({ json: {} });
    });

    await page.getByRole('button', { name: 'Upload an image for Cover' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Choose a file').setInputFiles(PNG);
    const upload = dialog.getByRole('button', { name: 'Upload' });
    await expect(upload).toBeDisabled();
    await dialog.getByLabel('Alt text').fill('Boats at dawn');
    await upload.click();
    await expect(page.getByText('harbour.png')).toBeVisible();
    expect(alt).toEqual({ alt: 'Boats at dawn' });

    const created = await saveDraft(page);
    expect(created.data).toEqual({ Title: 'Harbour', Cover: UPLOADED_ID });
});

test('file mode: an image picked from Files is saved as its file id', async ({ page }) => {
    await gotoNewStory(page);

    await page.getByRole('button', { name: 'Choose image for Cover' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /A jetty/ }).click();
    await expect(page.getByText('jetty.png')).toBeVisible();

    const created = await saveDraft(page);
    expect(created.data).toEqual({ Title: 'Harbour', Cover: EXISTING_ID });
});

test('inline mode: an image read in the browser is saved as a data URI with its alt text', async ({ page }) => {
    await gotoNewStory(page);

    await page.locator('#Badge').setInputFiles(PNG);
    await page.getByLabel('Alt text', { exact: true }).fill('A gold star');

    const created = await saveDraft(page);
    expect(created.data).toEqual({
        Title: 'Harbour',
        Badge: { url: `data:image/png;base64,${PNG_BASE64}`, alt: 'A gold star' },
    });
});
