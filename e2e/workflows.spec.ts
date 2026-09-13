import { expect, test } from '@playwright/test';
import { authed, pageOf, stubContentTypes, stubShell } from './helpers';

/**
 * Creating the workflow barakoPress asks a site owner for: Published on the post type, one Webhook
 * with a Url and a Secret. The unit tests cover the form; this covers the wiring to the API and that
 * the saved workflow says a Secret is set without ever showing one.
 */

const WEBHOOK_META = {
    type: 'Webhook',
    description: 'Send HTTP POST requests to external webhooks, signed when a Secret is set',
    requiredParameters: ['Url'],
    exampleConfiguration:
        '{"Type":"Webhook","Parameters":{"Url":"https://example.com/webhook","Secret":"a shared secret, optional"}}',
};

// What the API returns for a saved webhook workflow: the Secret removed, secretSet in its place.
const SAVED = {
    id: 'wf-press',
    name: 'Invalidate the site cache',
    triggerContentType: 'post',
    triggerEvent: 'Published',
    conditions: {},
    actions: [{ type: 'Webhook', parameters: { Url: 'https://site.example/api/revalidate' }, secretSet: true }],
};

test('a Published webhook workflow with a Secret can be created, and the Secret is not shown after', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, [{ id: 's1', name: 'post', displayName: 'Post', fields: [] }]);
    await page.route('**/api/workflows/actions', (r) => r.fulfill({ json: [WEBHOOK_META] }));
    await page.route('**/api/workflows/variables**', (r) =>
        r.fulfill({ json: { systemVariables: [], dataFields: [] } })
    );
    await page.route('**/api/workflows/*/debug**', (r) => r.fulfill({ json: [] }));

    let created: unknown = null;
    await page.route(/\/api\/workflows(\?|$)/, (r) => {
        if (r.request().method() === 'POST') {
            created = r.request().postDataJSON();
            return r.fulfill({ json: SAVED });
        }
        return r.fulfill({ json: pageOf(created ? [SAVED] : []) });
    });

    await page.goto('/workflows/new');
    await page.getByLabel('Name').fill('Invalidate the site cache');

    await page.getByRole('combobox', { name: /When an entry of type/ }).click();
    await page.getByRole('option', { name: 'Post' }).click();
    await page.getByRole('combobox', { name: /is$/ }).click();
    await page.getByRole('option', { name: 'Published' }).click();

    await page.getByRole('combobox', { name: 'Add an action' }).click();
    await page.getByRole('option', { name: 'Webhook' }).click();
    await page.getByLabel(/^Url/).fill('https://site.example/api/revalidate');
    const secret = page.getByLabel(/^Secret/);
    await expect(secret).toHaveAttribute('type', 'password');
    await secret.fill('shared-s3cret');

    await page.getByRole('button', { name: 'Create workflow' }).click();
    await expect(page).toHaveURL(/\/workflows$/);

    expect(created).toEqual({
        name: 'Invalidate the site cache',
        triggerContentType: 'post',
        triggerEvent: 'Published',
        conditions: {},
        actions: [
            { type: 'Webhook', parameters: { Url: 'https://site.example/api/revalidate', Secret: 'shared-s3cret' } },
        ],
    });

    await page.goto('/workflows/wf-press');
    await expect(page.getByText('Secret: set, not shown')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('https://site.example/api/revalidate')).toBeVisible();
    await expect(page.getByText('shared-s3cret')).toHaveCount(0);
});
