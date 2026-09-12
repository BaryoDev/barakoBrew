import { defineConfig, devices } from '@playwright/test';

/**
 * The unmocked pack: a real admin talking to a real API over HTTP.
 *
 * Separate from `playwright.config.ts` because the two answer different questions and must not be
 * confused for each other. That pack mocks every route with `page.route`, so it proves the admin
 * behaves correctly given the fixtures it was written against. It cannot prove those fixtures match
 * the server, because the same person wrote both.
 *
 * That gap shipped a real bug: the History panel read `versions` from a response that had returned
 * `items` since the envelope change, and rendered an empty list rather than failing. Every mocked
 * spec passed, because the mock returned `versions` too.
 *
 * No `webServer` here. `scripts/smoke-check.sh` owns the whole stack, since starting the admin
 * without a database behind it would produce exactly the false green this pack exists to remove.
 */
export default defineConfig({
    testDir: './smoke',
    /*
     * `.spec.ts` only, which is what every file in here is already called.
     *
     * Playwright's default testMatch takes `*.test.ts` as well, and vitest collects that pattern
     * across the whole repository. A unit test for a helper these specs share is therefore claimed by
     * both runners, and Playwright loads it and dies on `import ... from 'vitest'` before running a
     * single spec. Naming the one convention here keeps each runner to its own files, and
     * `src/test/runner-globs.test.ts` fails the fast job if that stops being true.
     */
    testMatch: '**/*.spec.ts',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    // No retries. A flake here is a real signal about the stack, and retrying would hide it behind
    // a green run, which is the failure mode this pack was added to fix.
    retries: 0,
    reporter: process.env.CI ? 'list' : 'html',
    use: {
        baseURL: process.env.SMOKE_ADMIN_URL || 'http://127.0.0.1:3200',
        trace: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
