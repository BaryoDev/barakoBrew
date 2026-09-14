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
async function stubFiles(page: Page, files: StoredFile[]) {
    const uploads: { body: string; contentType: string }[] = [];
    const deleted: string[] = [];

    await page.route(/\/api\/files(\?|$)/, async (route) => {
        const request = route.request();
        if (request.method() === 'POST') {
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
        // Exact, because the actions cell is named "Copy link to cover.png Delete cover.png" too.
        await expect(table.getByRole('cell', { name: 'cover.png', exact: true })).toBeVisible();
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
        await expect(page.getByRole('cell', { name: 'cover.png', exact: true })).toBeVisible({ timeout: 20000 });

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
});
