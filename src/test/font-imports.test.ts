// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ESLint } from 'eslint';

/**
 * The build must not need Google Fonts. `next/font/google` downloads the font files while
 * `next build` runs, and Turbopack fails the whole build when that request does not come back.
 *
 * The fonts are vendored instead, and `eslint.config.mjs` refuses the import. A rule nobody has seen
 * fail is a rule that may not be switched on, so this lints the import with the repository's own
 * config and expects the error. `npm run lint` then applies the same rule to every file.
 */

const LAYOUT = 'src/app/layout.tsx';

// Linted at more than one path, so a rule narrowed to one directory with `files` still fails here.
// None of these files exist; ESLint only uses the path to decide which config applies.
const PROBE_PATHS = ['src/app/font-probe.tsx', 'src/components/font-probe.tsx', 'packages/content-form/src/font-probe.ts'];

const GOOGLE_IMPORT =
    'import { Sora } from "next/font/google";\nexport const sora = Sora({ subsets: ["latin"], weight: ["600"] });\n';
const LOCAL_IMPORT =
    'import localFont from "next/font/local";\nexport const sora = localFont({ src: "./fonts/sora-latin-600.woff2" });\n';

const eslint = new ESLint({ cwd: process.cwd() });

async function restrictedImports(source: string, filePath: string) {
    const [result] = await eslint.lintText(source, { filePath });
    return result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
}

describe('fonts are vendored, not fetched during the build', () => {
    it.each(PROBE_PATHS)('lint refuses an import of next/font/google in %s', async (filePath) => {
        const messages = await restrictedImports(GOOGLE_IMPORT, filePath);

        expect(messages).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
        expect(messages[0].message).toContain('next/font/google');
    }, 60_000);

    it('lint accepts next/font/local, so the rule is about the source and not about fonts', async () => {
        expect(await restrictedImports(LOCAL_IMPORT, PROBE_PATHS[0])).toEqual([]);
    }, 60_000);

    it('the root layout is linted, so the rule reaches the one file that loads the fonts', async () => {
        expect(await eslint.isPathIgnored(LAYOUT)).toBe(false);
    });

    it('every font file the root layout names is in the repository, with a licence beside it', () => {
        const source = readFileSync(LAYOUT, 'utf8');
        const paths = [...new Set([...source.matchAll(/path:\s*"(\.\/fonts\/[^"]+)"/g)].map((m) => m[1]))];

        expect(paths).toHaveLength(3);
        for (const path of paths) {
            const file = join(dirname(LAYOUT), path);
            expect(existsSync(file), `${file} is named in ${LAYOUT} and is not in the repository`).toBe(true);

            const family = path.replace('./fonts/', '').split('-latin-')[0];
            const licence = join(dirname(LAYOUT), 'fonts', `OFL-${family}.txt`);
            expect(existsSync(licence), `${file} has no licence file at ${licence}`).toBe(true);
        }
    });
});
