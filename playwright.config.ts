import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
/*
 * The port the pack's own server runs on. 3100 rather than Next's default 3000, so it cannot
 * collide with an unrelated dev server.
 *
 * BARAKO_E2E_PORT overrides it because the number was written in three places and two checkouts of
 * this repository cannot run the pack at the same time. One blocks the other for as long as the
 * first takes. The worse case is quieter: with CI unset, reuseExistingServer is on, so the second
 * run does not start a server at all. It drives whatever is already answering on 3100, which is the
 * other checkout's code, and reports green about a branch it never loaded.
 */
const E2E_PORT = Number(process.env.BARAKO_E2E_PORT) || 3100;
const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

export default defineConfig({
    testDir: './e2e',
    // `.spec.ts` only; see the note in playwright.smoke.config.ts. `helpers.ts` is shared code,
    // not a spec, and a unit test for anything in here belongs to vitest.
    testMatch: '**/*.spec.ts',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. See E2E_PORT above. */
        baseURL: BASE_URL,

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // {
        //   name: 'firefox',
        //   use: { ...devices['Desktop Firefox'] },
        // },
        // {
        //   name: 'webkit',
        //   use: { ...devices['Desktop Safari'] },
        // },

        /* Test against mobile viewports. */
        {
            name: 'Mobile Chrome',
            use: { ...devices['Pixel 5'] },
        },
        {
            name: 'Mobile Safari',
            use: { ...devices['iPhone 12'] },
        },
    ],

    /* Start the admin before running tests. Specs mock the API via page.route, so the server only
       needs to boot — no backend required. reuseExistingServer keeps the local loop fast. */
    webServer: {
        command: `npm run dev -- -p ${E2E_PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
