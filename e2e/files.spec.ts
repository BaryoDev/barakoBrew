import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { authed, stubShell, pageOf } from './helpers';

/** The uploader id MOCK_TOKEN carries. */
const ME = '00000000-0000-0000-0000-000000000001';

interface StoredFile {
    id: string;
    fileName: string;
    contentType: string;
    size: number;
    isPublic: boolean;
    publicUrl: string | null;
    alt: string | null;
    caption: string | null;
    uploadedBy: string;
    createdAt: string;
}

/**
 * The files API as a small in-memory store, so upload, list and delete talk to one another the way
 * they do on the server. A fixed list would let a screen that never refetched after an upload pass.
 */
async function stubFiles(page: Page, files: StoredFile[], { uploadDelayMs = 0 } = {}) {
    const uploads: { body: string; contentType: string }[] = [];
    const deleted: string[] = [];

    await page.route(/\/api\/files(\?|$)/, async (route) => {
        const request = route.request();
        if (request.method() === 'POST') {
            if (uploadDelayMs > 0) await new Promise((done) => setTimeout(done, uploadDelayMs));
            const body = request.postDataBuffer()?.toString('latin1') ?? '';
            uploads.push({ body, contentType: request.headers()['content-type'] ?? '' });
            const name = /filename="([^"]+)"/.exec(body)?.[1] ?? 'unnamed';
            const record: StoredFile = {
                id: '99999999-9999-4999-8999-999999999999',
                fileName: name,
                contentType: 'image/png',
                size: 68,
                isPublic: /name="isPublic"\r\n\r\ntrue/.test(body),
                publicUrl: null,
                alt: null,
                caption: null,
                uploadedBy: ME,
                createdAt: new Date().toISOString(),
            };
            files.unshift(record);
            return route.fulfill({ status: 201, json: record });
        }
        return route.fulfill({ json: pageOf(files, 20) });
    });

    await page.route(/\/api\/files\/[^/?]+(\?.*)?$/, async (route) => {
        if (route.request().method() !== 'DELETE') return route.fallback();
        const id = new URL(route.request().url()).pathname.split('/').pop()!;
        deleted.push(id);
        const at = files.findIndex((f) => f.id === id);
        if (at >= 0) files.splice(at, 1);
        return route.fulfill({ status: 204 });
    });

    return { uploads, deleted };
}

/** A 1x1 transparent PNG, small enough to sit well inside the API's 10 MB limit. */
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
);

test.describe('files', () => {
    test('uploads a small image, lists it, and deletes it after confirming', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        const files: StoredFile[] = [];
        const { uploads, deleted } = await stubFiles(page, files);

        await page.goto('/files');
        await expect(page.getByRole('heading', { name: 'Files', exact: true })).toBeVisible({ timeout: 20000 });
        await expect(page.getByText('No files uploaded yet')).toBeVisible();

        await page.getByRole('button', { name: 'Upload file' }).first().click();
        await page.getByLabel('Choose a file').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG });
        await page.getByRole('switch', { name: 'Public' }).click();
        await page.getByRole('button', { name: 'Upload', exact: true }).click();

        const table = page.getByRole('table');
        // The name cell, by the viewer button inside it: the actions cell is named
        // "Copy link to cover.png Delete cover.png" and matches the file name too.
        await expect(table.getByRole('button', { name: 'View cover.png' })).toBeVisible();
        await expect(table.getByText('Public', { exact: true })).toBeVisible();

        // Sent as multipart with the flag, not as JSON. The API reads the file from the form and
        // the flag from a form field, so a JSON body would be refused as "A file is required."
        expect(uploads).toHaveLength(1);
        expect(uploads[0].contentType).toContain('multipart/form-data');
        expect(uploads[0].body).toContain('filename="cover.png"');
        expect(uploads[0].body).toMatch(/name="isPublic"\r\n\r\ntrue/);

        await page.getByRole('button', { name: 'Delete cover.png' }).click();
        await expect(page.getByRole('alertdialog')).toContainText('cover.png');
        await page.getByRole('button', { name: 'Delete', exact: true }).click();

        await expect.poll(() => deleted).toEqual(['99999999-9999-4999-8999-999999999999']);
        await expect(page.getByText('No files uploaded yet')).toBeVisible();
    });

    test('thumbnails load the API image variant at 160px, never the original', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        const row = (id: string, fileName: string, contentType: string, isPublic: boolean): StoredFile => ({
            id,
            fileName,
            contentType,
            size: 4 * 1024 * 1024,
            isPublic,
            publicUrl: null,
            alt: null,
            caption: null,
            uploadedBy: ME,
            createdAt: new Date().toISOString(),
        });
        await stubFiles(page, [
            row('pub-png', 'cover.png', 'image/png', true),
            row('priv-jpg', 'draft.jpg', 'image/jpeg', false),
            row('doc-pdf', 'bylaws.pdf', 'application/pdf', true),
            row('pic-avif', 'hero.avif', 'image/avif', false),
        ]);

        // Every download of any file, public or authenticated, with the header it carried.
        const downloads: { url: string; authorization: string | undefined }[] = [];
        await page.route(/\/api\/(public\/)?files\/[^/?]+(\?.*)?$/, async (route) => {
            const request = route.request();
            if (request.method() !== 'GET') return route.fallback();
            downloads.push({ url: request.url(), authorization: request.headers()['authorization'] });
            return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
        });

        await page.goto('/files');
        await expect(page.getByRole('button', { name: 'View cover.png' })).toBeVisible({ timeout: 20000 });

        const paths = () => downloads.map((d) => new URL(d.url)).map((u) => `${u.pathname}${u.search}`);
        await expect.poll(paths).toHaveLength(2);
        expect(paths().sort()).toEqual(['/api/files/priv-jpg?w=160', '/api/public/files/pub-png?w=160']);

        // The private one went through the API client with the bearer, and the token is in a header,
        // not in the URL.
        const priv = downloads.find((d) => d.url.includes('priv-jpg'))!;
        expect(priv.authorization).toMatch(/^Bearer /);
        expect(priv.url).not.toContain('eyJ');
        const pub = downloads.find((d) => d.url.includes('pub-png'))!;
        expect(pub.authorization).toBeUndefined();

        await expect(page.locator('img[src*="/api/public/files/pub-png?w=160"]')).toHaveAttribute(
            'srcset',
            /pub-png\?w=160 160w/,
        );
        await expect(page.locator('img[src^="blob:"]')).toHaveCount(1);
    });

    test('a thumbnail opens the image at the rung that covers this screen, and Escape closes it', async ({
        page,
    }) => {
        await authed(page);
        await stubShell(page);
        await stubFiles(page, [
            {
                id: 'pub-png',
                fileName: 'cover.png',
                contentType: 'image/png',
                size: 4 * 1024 * 1024,
                isPublic: true,
                publicUrl: null,
                alt: null,
                caption: null,
                uploadedBy: ME,
                createdAt: new Date().toISOString(),
            },
        ]);
        await page.route(/\/api\/public\/files\/[^/?]+(\?.*)?$/, (route) =>
            route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
        );

        await page.goto('/files');
        const thumbnail = page.getByRole('button', { name: 'View cover.png' });
        await expect(thumbnail).toBeVisible({ timeout: 20000 });
        await thumbnail.click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('image/png, 4.0 MB');

        // The rung this screen needs, worked out from the screen rather than pinned, since the
        // three projects run at three different widths and densities.
        const wanted = await page.evaluate(() => {
            const ladder = [160, 320, 640, 960, 1280, 1920];
            const needed = Math.round(window.innerWidth * (window.devicePixelRatio || 1));
            return ladder.find((rung) => rung >= needed) ?? ladder[ladder.length - 1];
        });
        await expect(dialog.locator('img')).toHaveAttribute(
            'src',
            new RegExp(`/api/public/files/pub-png\\?w=${wanted}$`),
        );

        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
    });

    test('the dialog closes on Upload, and the upload finishes in the tray', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        const files: StoredFile[] = [];
        const { uploads } = await stubFiles(page, files, { uploadDelayMs: 1500 });

        await page.goto('/files');
        await expect(page.getByRole('heading', { name: 'Files', exact: true })).toBeVisible({ timeout: 20000 });

        await page.getByRole('button', { name: 'Upload file' }).first().click();
        await page
            .getByLabel('Choose a file')
            .setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: PNG });
        await page.getByRole('button', { name: 'Upload', exact: true }).click();

        // The dialog is gone while the request is still out, and the tray has the file.
        await expect(page.getByLabel('Choose a file')).toBeHidden();
        const tray = page.getByRole('region', { name: 'Uploads' });
        await expect(tray).toBeVisible();
        await expect(tray).toContainText('slow.png');
        expect(uploads).toHaveLength(1);

        // And the list catches up on its own once the API answers.
        await expect(page.getByRole('button', { name: 'View slow.png' })).toBeVisible({ timeout: 20000 });
        await expect(tray).toContainText('1 finished');
    });
});
