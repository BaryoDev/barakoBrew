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
    // An API without share links or the Pages module, so the Site screen hides the one and types the path.
    await page.route('**/api/site/share-links', (route) => route.fulfill({ status: 404, json: {} }));
    await page.route('**/api/pages/tree', (route) => route.fulfill({ status: 404, json: {} }));
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

const THEMED_SITE_TYPE = {
    ...SITE_TYPE,
    fields: [
        ...SITE_TYPE.fields,
        { name: 'Tokens', displayName: 'Tokens', type: 'json', isRequired: false },
        { name: 'Tones', displayName: 'Tones', type: 'json', isRequired: false },
        { name: 'StyleRecipes', displayName: 'Style recipes', type: 'json', isRequired: false },
    ],
};

test('Theme adds a token and a tone that names it, previews the tone, and saves both', async ({ page }) => {
    await stubContentTypes(page, [ARTICLE, THEMED_SITE_TYPE]);
    const puts = await serveSite(page, [
        siteEntry({ Name: 'barakocms.com', Tokens: { 'cms-bg': '#E8EEFD' }, Colors: { pageBg: '#FFFFFF' } }),
    ]);

    await page.goto('/site/theme');
    await expect(page.getByRole('textbox', { name: 'Token 1 name' })).toHaveValue('cms-bg');

    await page.getByRole('button', { name: 'Add token' }).click();
    await page.getByRole('textbox', { name: 'Token 2 name' }).fill('cms-ink');
    await page.getByRole('textbox', { name: 'Token 2 value' }).fill('#1D3A8A');

    await page.getByRole('button', { name: 'Add tone' }).click();
    await page.getByRole('textbox', { name: 'Tone 1 name' }).fill('cms');
    await page.getByRole('combobox', { name: 'Tone 1 ink' }).fill('cms-ink');
    await page.getByRole('combobox', { name: 'Tone 1 background' }).fill('cms-bg');
    await page.getByRole('combobox', { name: 'Tone 1 edge' }).fill('hairline');

    const chip = page.getByTestId('tone-chip');
    await expect(chip).toHaveCSS('color', 'rgb(29, 58, 138)');
    await expect(chip).toHaveCSS('background-color', 'rgb(232, 238, 253)');

    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0]).toMatchObject({
        data: {
            Name: 'barakocms.com',
            Colors: { pageBg: '#FFFFFF' },
            Tokens: { 'cms-bg': '#E8EEFD', 'cms-ink': '#1D3A8A' },
            Tones: { cms: { ink: 'cms-ink', bg: 'cms-bg', edge: 'hairline' } },
        },
    });
});

test('Theme will not save a token or a tone the site would drop', async ({ page }) => {
    await stubContentTypes(page, [ARTICLE, THEMED_SITE_TYPE]);
    await serveSite(page, [siteEntry({ Name: 'barakocms.com', Tokens: { gutter: '24px' } })]);

    await page.goto('/site/theme');
    await page.getByRole('textbox', { name: 'Token 1 value' }).fill('24px; color: red');
    await expect(page.getByText('Not a colour, a length (or a clamp of three) or a font stack. The site drops it.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await expect(page.getByText('A token has a problem the site would drop. Fix it to save.')).toBeVisible();

    await page.getByRole('textbox', { name: 'Token 1 value' }).fill('24px');
    await page.getByRole('button', { name: 'Add tone' }).click();
    await page.getByRole('textbox', { name: 'Tone 1 name' }).fill('accent');
    await expect(page.getByText('accent is a built-in tone, which follows the colours. Pick another name.')).toBeVisible();
    await page.getByRole('combobox', { name: 'Tone 1 ink' }).fill('gutter');
    await expect(page.getByText('Ink: The token gutter does not hold a colour.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
});

test('a site type without the fields says so rather than editing a value the site cannot read', async ({ page }) => {
    await stubContentTypes(page, [ARTICLE, SITE_TYPE]);
    // Values the site would drop, stored under names the type does not declare. The screen does not
    // edit them, so they must not hold back a save of what it does edit.
    await serveSite(page, [
        siteEntry({
            Name: 'baryo.dev',
            Tokens: { accent: 'url(x)' },
            StyleRecipes: { card: { style: { background: 'url(x)' } } },
        }),
    ]);

    await page.goto('/site/theme');
    await expect(page.getByText('The site type has no Tokens field, so the site cannot read tokens yet.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add token' })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'accent', exact: true }).fill('#17458F');
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    await expect(page.getByText('problem the site would drop', { exact: false })).toHaveCount(0);

    await page.goto('/site/recipes');
    await expect(page.getByText('The site type has no StyleRecipes field', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add recipe' })).toHaveCount(0);
});

test('Style recipes builds a card from allowed properties, previews it, and saves it', async ({ page }) => {
    await stubContentTypes(page, [ARTICLE, THEMED_SITE_TYPE]);
    const puts = await serveSite(page, [
        siteEntry({ Name: 'barakocms.com', Colors: { surface: '#FFFFFF', hairline: '#E7E8F1' }, Tokens: { gap: '12px' } }),
    ]);

    await page.goto('/site/recipes');
    await page.getByRole('button', { name: 'Add recipe' }).click();
    await page.getByRole('textbox', { name: 'Recipe 1 name' }).fill('card');
    await page.getByRole('textbox', { name: 'Recipe 1 classes (optional)' }).fill('lift');

    const add = page.getByRole('button', { name: 'Add a property to recipe 1' });
    await add.click();
    await page.getByRole('combobox', { name: 'Recipe 1 property 1', exact: true }).selectOption('padding');
    await page.getByRole('combobox', { name: 'Recipe 1 property 1 value' }).fill('22px 24px');
    await add.click();
    await page.getByRole('combobox', { name: 'Recipe 1 property 2', exact: true }).selectOption('border');
    await page.getByRole('combobox', { name: 'Recipe 1 property 2 value' }).fill('1px solid {colors.hairline}');
    await add.click();
    await page.getByRole('combobox', { name: 'Recipe 1 property 3', exact: true }).selectOption('gap');
    await page.getByRole('combobox', { name: 'Recipe 1 property 3 value' }).fill('{gap}');

    const preview = page.getByTestId('recipe-preview');
    await expect(preview).toHaveCSS('padding', '22px 24px');
    await expect(preview).toHaveCSS('border-top-color', 'rgb(231, 232, 241)');
    await expect(preview).toHaveCSS('row-gap', '12px');

    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0]).toMatchObject({
        data: {
            Name: 'barakocms.com',
            Tokens: { gap: '12px' },
            StyleRecipes: {
                card: { class: 'lift', style: { padding: '22px 24px', border: '1px solid {colors.hairline}', gap: '{gap}' } },
            },
        },
    });
});

test('Style recipes refuses a value that could load something, and warns about a name it cannot resolve', async ({ page }) => {
    await stubContentTypes(page, [ARTICLE, THEMED_SITE_TYPE]);
    await serveSite(page, [
        siteEntry({ Name: 'barakocms.com', StyleRecipes: { card: { style: { background: '{colors.surface}' } } } }),
    ]);

    await page.goto('/site/recipes');
    const value = page.getByRole('combobox', { name: 'Recipe 1 property 1 value' });
    await expect(value).toHaveValue('{colors.surface}');

    await value.fill('url(https://evil.example/x.png)');
    await expect(page.getByText('The site refuses this value.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await value.fill('{brand}');
    await expect(page.getByText('{brand} is not in these settings.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
});
