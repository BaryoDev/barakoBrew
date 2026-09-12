import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Two test runners share this repository, and a file claimed by both breaks the slow one.
 *
 * vitest takes `**​/*.test.{ts,tsx}` repository-wide. Playwright takes whatever its `testMatch` says
 * inside its `testDir`, and its default includes `*.test.ts`. So a unit test written next to a
 * Playwright pack, which is the natural place for a test covering a helper those specs share, is
 * loaded by Playwright too, and it dies on `import ... from 'vitest'` before running a single spec.
 *
 * That happened: `smoke/api-url.test.ts` took down the whole unmocked pack, and the only job that
 * could see it was the one that stands up a database, builds the console and takes twelve minutes.
 * This lives in the thirty second job instead, so the break is caught where it is cheap.
 *
 * It asserts the arrangement rather than the symptom: each Playwright config pins `.spec.ts`, and
 * nothing inside a Playwright directory is named the way vitest collects.
 */

const PACKS = [
    { config: 'playwright.config.ts', dir: 'e2e' },
    { config: 'playwright.smoke.config.ts', dir: 'smoke' },
];

describe('the two test runners do not collect the same files', () => {
    it.each(PACKS)('$config pins .spec.ts rather than taking the default', ({ config }) => {
        const source = readFileSync(config, 'utf8');
        // Without this line Playwright's default applies, and that default includes *.test.ts.
        expect(source, `${config} must pin testMatch, or it collects vitest files too`).toContain(
            "testMatch: '**/*.spec.ts'"
        );
    });

    it.each(PACKS)('nothing in $dir is named the way vitest collects', ({ dir }) => {
        const collected = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((name) =>
            /\.test\.(ts|tsx)$/.test(name)
        );
        expect(
            collected,
            `${collected.join(', ')} under ${dir}/ is collected by vitest. ` +
                'A unit test for a helper shared by that pack belongs in src/, or the helper does.'
        ).toEqual([]);
    });

    it('finds the Playwright specs it claims to be guarding, so this cannot pass on an empty repo', () => {
        for (const { dir } of PACKS) {
            const specs = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((name) =>
                name.endsWith('.spec.ts')
            );
            expect(specs.length, `${dir}/ holds no specs, so the assertions above prove nothing`).toBeGreaterThan(0);
        }
    });
});
