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

test('the action picker lists kinds under the group the API reports, ungrouped ones under Other', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, [{ id: 's1', name: 'post', displayName: 'Post', fields: [] }]);
    await page.route('**/api/workflows/actions', (r) =>
        r.fulfill({
            json: [
                { ...WEBHOOK_META, group: 'Delivery' },
                { type: 'Conditional', description: '', requiredParameters: ['Condition'], exampleConfiguration: '{}', group: 'Flow' },
                { type: 'Email', description: '', requiredParameters: ['To'], exampleConfiguration: '{}', group: 'Comms' },
                { type: 'Custom', description: '', requiredParameters: ['Thing'], exampleConfiguration: '{}', group: null },
            ],
        })
    );
    await page.route('**/api/workflows/variables**', (r) =>
        r.fulfill({ json: { systemVariables: [], dataFields: [] } })
    );

    await page.goto('/workflows/new');
    await page.getByRole('combobox', { name: 'Add an action' }).click();

    const listbox = page.getByRole('listbox');
    await expect(listbox.getByRole('option')).toHaveCount(4);
    await expect(listbox.getByRole('group')).toHaveCount(4);
    for (const [group, kind] of [['Delivery', 'Webhook'], ['Comms', 'Email'], ['Flow', 'Conditional'], ['Other', 'Custom']]) {
        await expect(listbox.getByRole('group', { name: group }).getByRole('option', { name: kind })).toBeVisible();
    }
    await expect(listbox.getByRole('group')).toHaveText(['DeliveryWebhook', 'CommsEmail', 'FlowConditional', 'OtherCustom']);

    await listbox.getByRole('option', { name: 'Custom' }).click();
    await expect(page.getByLabel(/^Thing/)).toBeVisible();
});

// As GET /api/workflows/actions returns RequestAction on barakoCMS 5.0, and GET /api/requests a definition.
const REQUEST_META = {
    type: 'Request',
    description: 'Send a configured request through a configured connector',
    requiredParameters: ['Request'],
    exampleConfiguration: '{"Type":"Request","Parameters":{"Request":"post-to-facebook"}}',
    group: 'Delivery',
};

const FACEBOOK_REQUEST = {
    id: 'r2',
    name: 'Post to Facebook',
    slug: 'post-to-facebook',
    connectorSlug: 'facebook',
    method: 'POST',
    pathTemplate: '/v19.0/{{data.PageId}}/feed',
    headerTemplates: {},
    bodyTemplate: '{"message":"{{data.Title}}"}',
    bodyContentType: 'application/json',
    querySlug: null,
    success: 'TwoHundredRange',
    successJsonPath: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
};

test('a Request action is created by picking a configured request, not by typing its slug', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await stubContentTypes(page, [{ id: 's1', name: 'post', displayName: 'Post', fields: [] }]);
    await page.route('**/api/workflows/actions', (r) => r.fulfill({ json: [REQUEST_META] }));
    await page.route('**/api/workflows/variables**', (r) =>
        r.fulfill({ json: { systemVariables: [], dataFields: [] } })
    );
    await page.route(/\/api\/requests(\?|$)/, (r) => r.fulfill({ json: pageOf([FACEBOOK_REQUEST]) }));

    let created: unknown = null;
    await page.route(/\/api\/workflows(\?|$)/, (r) => {
        if (r.request().method() === 'POST') {
            created = r.request().postDataJSON();
            return r.fulfill({ json: { ...(created as object), id: 'wf-share' } });
        }
        return r.fulfill({ json: pageOf([]) });
    });

    await page.goto('/workflows/new');
    await page.getByLabel('Name').fill('Share on publish');
    await page.getByRole('combobox', { name: /When an entry of type/ }).click();
    await page.getByRole('option', { name: 'Post' }).click();

    await page.getByRole('button', { name: 'Add Request' }).click();
    await page.getByRole('combobox', { name: 'Request', exact: true }).click();
    await page.getByRole('option', { name: 'Post to Facebook (post-to-facebook)' }).click();
    const sends = page.getByLabel('What this request sends');
    await expect(sends).toContainText('POST');
    await expect(sends).toContainText('/v19.0/{{data.PageId}}/feed');

    await page.getByRole('button', { name: 'Create workflow' }).click();
    await expect(page).toHaveURL(/\/workflows$/);

    expect(created).toEqual({
        name: 'Share on publish',
        triggerContentType: 'post',
        triggerEvent: 'Created',
        conditions: {},
        actions: [{ type: 'Request', parameters: { Request: 'post-to-facebook' } }],
    });
});

test('switching a workflow off writes enabled false to the API', async ({ page }) => {
    await authed(page);
    await stubShell(page);
    await page.route('**/api/workflow-runs**', (r) => r.fulfill({ json: pageOf([]) }));

    let workflow = { ...SAVED, enabled: true };
    let written: unknown = null;
    await page.route(/\/api\/workflows\/wf-press\/enabled$/, (r) => {
        written = r.request().postDataJSON();
        workflow = { ...workflow, enabled: (written as { enabled: boolean }).enabled };
        return r.fulfill({ json: workflow });
    });
    await page.route(/\/api\/workflows(\?|$)/, (r) => r.fulfill({ json: pageOf([workflow]) }));

    await page.goto('/workflows');
    const toggle = page.getByRole('switch', { name: 'Invalidate the site cache is on' });
    await expect(toggle).toBeChecked({ timeout: 15000 });
    await toggle.click();

    await expect.poll(() => written).toEqual({ enabled: false });
    await expect(toggle).not.toBeChecked();
});
