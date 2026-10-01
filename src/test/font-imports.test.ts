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

async function restrictedImports(source: string) {
    const eslint = new ESLint({ cwd: process.cwd() });
    const [result] = await eslint.lintText(source, { filePath: 'src/app/font-probe.tsx' });
    return result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
}

describe('fonts are vendored, not fetched during the build', () => {
    it('lint refuses an import of next/font/google', async () => {
        const messages = await restrictedImports(
            'import { Sora } from "next/font/google";\nexport const sora = Sora({ subsets: ["latin"], weight: ["600"] });\n'
        );

        expect(messages).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
        expect(messages[0].message).toContain('next/font/google');
    }, 60_000);

    it('lint accepts next/font/local, so the rule is about the source and not about fonts', async () => {
        const messages = await restrictedImports(
            'import localFont from "next/font/local";\nexport const sora = localFont({ src: "./fonts/sora-latin-600.woff2" });\n'
        );

        expect(messages).toEqual([]);
    }, 60_000);

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
