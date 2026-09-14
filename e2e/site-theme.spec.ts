import { test, expect, type Page } from '@playwright/test';
import { authed, pageOf, stubContentTypes, stubShell } from './helpers';

const ID = '5b0f3c1e-2f4d-4b8a-9c61-7e2d1a0b9f34';

const ARTICLE = { name: 'article', displayName: 'Article', isSingleton: false, fields: [] };

const SITE_TYPE = {
    name: 'site',
    displayName: 'Site',
    isSingleton: true,
    isPubliclyDeliverable: true,
    fields: [
        { name: 'Name', displayName: 'Site name', type: 'string', isRequired: true },
        { name: 'Colors', displayName: 'Colours', type: 'json', isRequired: false },
        { name: 'HeaderLinks', displayName: 'Header links', type: 'json', isRequired: false },
    ],
};

function siteEntry(data: Record<string, unknown>) {
    return {
        id: ID,
        contentType: 'site',
        data,
        status: 'Published',
        sensitivity: 'Public',
        version: 3,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
    };
}

async function serveSite(page: Page, entries: ReturnType<typeof siteEntry>[]) {
    const puts: unknown[] = [];
    await page.route(/\/api\/contents(\?|$)/, (route) => {
        const type = new URL(route.request().url()).searchParams.get('contentType');
        return route.fulfill({ json: pageOf(type === 'site' ? entries : []) });
    });
    await page.route(`**/api/contents/${ID}`, (route) => {
        if (route.request().method() === 'PUT') {
            puts.push(route.request().postDataJSON());
            return route.fulfill({ json: { id: ID, version: 4 } });
        }
        return route.fulfill({ json: entries[0] });
    });
    return puts;
}

test.beforeEach(async ({ page }) => {
    await authed(page);
    await stubShell(page);
});

test('with no site type, Site offers the blueprint and then shows the form', async ({ page }) => {
    let types: unknown[] = [ARTICLE];
    const applied: string[] = [];
    await page.route(/\/api\/content-types(\?|$)/, (r) => r.fulfill({ json: pageOf(types) }));
    await page.route('**/api/content-types/blueprints/*', (route) => {
        applied.push(new URL(route.request().url()).pathname);
        types = [ARTICLE, SITE_TYPE];
        return route.fulfill({ json: { blueprint: 'site', created: [{ name: 'site' }] } });
    });
    await serveSite(page, []);

    await page.goto('/site');
    await page.getByRole('button', { name: 'Create the site type' }).click();

    await expect(page.getByRole('textbox', { name: 'Site name (required)' })).toBeVisible();
    expect(applied).toEqual(['/api/content-types/blueprints/site']);
    // The first save creates the entry, and it cannot be made without a name.
    await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();
});

test('Theme flags a pair below AA, redraws the preview, and saves colours over the stored entry', async ({ page }) => {
    await stubContentTypes(page, [ARTICLE, SITE_TYPE]);
    const puts = await serveSite(page, [
        siteEntry({
            Name: 'Rotary Club of Koronadal',
            HeaderLinks: [{ label: 'Donate', href: '/donate' }],
            Colors: { pageBg: '#FFFFFF', ink: '#1C1C1C', accent: '#17458F', accentInk: '#FFFFFF' },
        }),
    ]);

    await page.goto('/site/theme');

    const summary = page.getByTestId('contrast-summary');
    await expect(summary).toHaveText('No pair is below AA.');
    const button = page.getByTestId('preview-button');
    await expect(button).toHaveCSS('background-color', 'rgb(23, 69, 143)');

    // The rckoronadal gold as the accent: links on white and white button text both drop below AA.
    await page.getByRole('textbox', { name: 'accent', exact: true }).fill('#F7A81B');

    await expect(button).toHaveCSS('background-color', 'rgb(247, 168, 27)');
    await expect(summary).toHaveText('2 pairs are below AA. You can still save.');

    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0]).toMatchObject({
        id: ID,
        version: 3,
        status: 'Published',
        data: {
            Name: 'Rotary Club of Koronadal',
            HeaderLinks: [{ label: 'Donate', href: '/donate' }],
            Colors: { pageBg: '#FFFFFF', ink: '#1C1C1C', accent: '#F7A81B', accentInk: '#FFFFFF' },
        },
    });
});

test('a header link the site would drop is flagged on the Site screen', async ({ page }) => {
    await stubContentTypes(page, [ARTICLE, SITE_TYPE]);
    await serveSite(page, [siteEntry({ Name: 'baryo.dev', HeaderLinks: [{ label: 'Blog', href: '/blog' }] })]);

    await page.goto('/site');
    const href = page.getByRole('textbox', { name: 'Link 1', exact: true });
    await expect(href).toHaveValue('/blog');
    await href.fill('javascript:alert(1)');

    await expect(page.getByText('The site drops any other link.')).toBeVisible();
});

test('a domain another tenant holds is refused inline with the API sentence', async ({ page }) => {
    const tenant = {
        id: 't1',
        slug: 'baryo',
        name: 'Baryo',
        isActive: true,
        domains: ['baryo.dev'],
        branding: {},
    };
    const message = "'rckoronadal.org' is already a domain of tenant 'rckoronadal'. A domain belongs to one tenant.";
    const puts: unknown[] = [];
    await page.route(/\/api\/tenants(\?|$)/, (r) => r.fulfill({ json: pageOf([tenant]) }));
    await page.route('**/api/tenants/members**', (r) => r.fulfill({ json: pageOf([]) }));
    await page.route('**/api/tenants/baryo', (route) => {
        puts.push(route.request().postDataJSON());
        return route.fulfill({ status: 409, json: { statusCode: 409, message, errors: {} } });
    });

    await page.goto('/tenants');
    await page.getByRole('button', { name: 'Edit domains for Baryo' }).click();
    await page.getByRole('textbox', { name: 'Domains' }).fill('baryo.dev\nrckoronadal.org');
    await page.getByRole('button', { name: 'Save domains' }).click();

    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(message);
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ Handle: 'baryo', Name: 'Baryo', IsActive: true, Domains: ['baryo.dev', 'rckoronadal.org'] });
});
