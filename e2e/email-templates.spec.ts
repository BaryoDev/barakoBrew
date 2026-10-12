import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { authed, pageOf, stubContentTypes, stubShell } from './helpers';

/**
 * A template reworded, saved and previewed against a real entry, without opening a workflow. The
 * API shapes are barakoCMS 5.0's: templates are entries of the email blueprint's types, and the
 * preview is POST /api/email-templates/{id}/preview.
 */

const ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const ANA = '11111111-1111-1111-1111-111111111111';

const TEMPLATE = {
    id: ID,
    contentType: 'email-template',
    status: 'Published',
    sensitivity: 'Public',
    version: 2,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    data: { Name: 'Welcome', Slug: 'welcome', Subject: 'Hello', Body: 'Thanks for booking.' },
};

const PREVIEW = {
    subject: 'Hello Ana',
    html: '<!DOCTYPE html><html><body><p>Thanks for booking, Ana.</p></body></html>',
    status: 'Published',
    sendable: true,
    problem: null,
    warnings: [],
    notes: [],
};

async function stubTemplates(page: Page) {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, [
        { id: 's1', name: 'booking', displayName: 'Booking', fields: [] },
        { id: 's2', name: 'email-template', displayName: 'Email template', fields: [] },
    ]);
    await page.route(/\/api\/contents(\?|$)/, (r) => {
        const type = new URL(r.request().url()).searchParams.get('contentType');
        if (type === 'email-template') return r.fulfill({ json: pageOf([TEMPLATE]) });
        if (type === 'booking') {
            return r.fulfill({ json: pageOf([{ id: ANA, contentType: 'booking', status: 'Published', data: { Title: 'Ana' } }]) });
        }
        return r.fulfill({ json: pageOf([]) });
    });
    await page.route(/\/api\/workflows(\?|$)/, (r) =>
        r.fulfill({
            json: pageOf([
                {
                    id: 'wf-1',
                    name: 'Greet a booker',
                    triggerContentType: 'booking',
                    triggerEvent: 'Created',
                    conditions: {},
                    actions: [{ type: 'Email', parameters: { To: '{{data.Email}}', Template: 'welcome' } }],
                },
            ]),
        })
    );
    await page.route('**/api/workflows/variables**', (r) =>
        r.fulfill({
            json: {
                systemVariables: [{ name: '{{createdBy.email}}', description: 'The author', example: '', type: 'string' }],
                dataFields: [{ name: '{{data.Title}}', description: 'Title', example: '', type: 'string' }],
            },
        })
    );
}

test('a template is reworded, saved and previewed against an entry', async ({ page }) => {
    await stubTemplates(page);
    let saved: unknown = null;
    await page.route(new RegExp(`/api/contents/${ID}$`), (r) => {
        if (r.request().method() === 'PUT') {
            saved = r.request().postDataJSON();
            return r.fulfill({ json: { id: ID, version: 3 } });
        }
        return r.fulfill({ json: TEMPLATE });
    });
    let previewed: unknown = null;
    await page.route(new RegExp(`/api/email-templates/${ID}/preview$`), (r) => {
        previewed = r.request().postDataJSON();
        return r.fulfill({ json: PREVIEW });
    });

    await page.goto('/email-templates');
    await expect(page.getByRole('list', { name: 'Workflows using Welcome' })).toHaveText('Greet a booker', { timeout: 15000 });
    await page.getByRole('link', { name: 'Welcome' }).click();

    await page.getByRole('combobox', { name: 'Sent for entries of type' }).click();
    await page.getByRole('option', { name: 'Booking' }).click();
    const subject = page.getByLabel('Subject', { exact: true });
    await subject.fill('Hello ');
    await page.getByRole('radio', { name: 'Subject' }).click();
    await page.getByRole('button', { name: 'Insert {{data.Title}}' }).click();
    await expect(subject).toHaveValue('Hello {{data.Title}}');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => saved).toEqual({
        id: ID,
        data: { Name: 'Welcome', Slug: 'welcome', Subject: 'Hello {{data.Title}}', Body: 'Thanks for booking.' },
        status: 'Published',
        version: 2,
    });

    await page.getByRole('combobox', { name: 'Against the entry' }).click();
    await page.getByRole('option', { name: 'Ana' }).click();
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect.poll(() => previewed).toEqual({ entryId: ANA });
    await expect(page.getByText('Hello Ana')).toBeVisible();
    await expect(page.frameLocator('iframe[title="Email preview"]').getByText('Thanks for booking, Ana.')).toBeVisible();
});
