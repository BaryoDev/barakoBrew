import { test, expect } from '@playwright/test';
import { authed, stubShell, stubContentTypes } from './helpers';

test.describe('import a spreadsheet', () => {
    test('sends the chosen file as multipart form data and shows the preview grid', async ({ page }) => {
        await authed(page);
        await stubShell(page);
        await stubContentTypes(page);

        const analyses: { body: string; contentType: string }[] = [];
        await page.route('**/api/import/analyze', async (route) => {
            const request = route.request();
            analyses.push({
                body: request.postDataBuffer()?.toString('latin1') ?? '',
                contentType: request.headers()['content-type'] ?? '',
            });
            const cell = (value: string) => ({ kind: 'Text', value });
            return route.fulfill({
                json: {
                    rowCount: 2,
                    columnCount: 2,
                    suggestedHeaderRow: 0,
                    truncated: false,
                    rows: [
                        [cell('Title'), cell('Body')],
                        [cell('Spring roast'), cell('Beans from Batangas')],
                    ],
                },
            });
        });

        await page.goto('/settings/import');
        await expect(page.getByRole('heading', { name: 'Import a spreadsheet' })).toBeVisible({ timeout: 20000 });

        await page.getByLabel('Spreadsheet to import').setInputFiles({
            name: 'posts.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('Title,Body\nSpring roast,Beans from Batangas\n'),
        });

        await expect(page.getByRole('cell', { name: 'Spring roast' })).toBeVisible();
        expect(analyses).toHaveLength(1);
        expect(analyses[0].contentType).toContain('multipart/form-data');
        expect(analyses[0].body).toContain('name="file"; filename="posts.csv"');
    });
});
