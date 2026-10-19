// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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
    'import { Instrument_Sans } from "next/font/google";\nexport const sans = Instrument_Sans({ subsets: ["latin"], weight: ["400"] });\n';
const LOCAL_IMPORT =
    'import localFont from "next/font/local";\nexport const sans = localFont({ src: "./fonts/instrument-sans-latin-wght.woff2" });\n';

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
        expect(paths.map((p) => p.replace('./fonts/', '').split('-latin-')[0]).sort()).toEqual([
            'bricolage-grotesque',
            'instrument-sans',
            'jetbrains-mono',
        ]);
        for (const path of paths) {
            const file = join(dirname(LAYOUT), path);
            // A missing file makes readFileSync throw, which fails the test and names the path.
            expect(readFileSync(file).length, `${file} is named in ${LAYOUT}`).toBeGreaterThan(0);

            const family = path.replace('./fonts/', '').split('-latin-')[0];
            const licence = join(dirname(LAYOUT), 'fonts', `OFL-${family}.txt`);
            expect(readFileSync(licence, 'utf8'), `${file} has no licence file at ${licence}`).toContain('SIL OPEN FONT LICENSE');
        }
    });
});

describe('the console typefaces', () => {
    const layout = readFileSync(LAYOUT, 'utf8');

    it('the layout sets up Bricolage Grotesque, Instrument Sans and JetBrains Mono', () => {
        const variables = [...layout.matchAll(/variable:\s*"(--[a-z-]+)"/g)].map((m) => m[1]);
        expect(variables.sort()).toEqual(['--font-bricolage-grotesque', '--font-instrument-sans', '--font-jetbrains-mono']);
    });

    it('the weight ranges are 500 to 700, 400 to 700 and 400 to 500', () => {
        const weights = [...layout.matchAll(/weight:\s*"([^"]+)"/g)].map((m) => m[1]);
        expect(weights).toEqual(['500 700', '400 700', '400 500']);
    });

    it('the theme tokens point at those variables', () => {
        const css = readFileSync('src/app/globals.css', 'utf8');
        expect(css).toContain('--font-sans: var(--font-instrument-sans);');
        expect(css).toContain('--font-display: var(--font-bricolage-grotesque);');
        expect(css).toContain('--font-mono: var(--font-jetbrains-mono);');
    });

    it('no mono text asks for a weight above 500', () => {
        const offenders: string[] = [];
        const visit = (dir: string) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const name = entry.name;
                const path = join(dir, name);
                if (entry.isDirectory()) visit(path);
                else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) {
                    readFileSync(path, 'utf8')
                        .split('\n')
                        .forEach((line, i) => {
                            if (/\bfont-mono\b/.test(line) && /\bfont-(semibold|bold|extrabold|black)\b/.test(line)) {
                                offenders.push(`${path}:${i + 1}`);
                            }
                        });
                }
            }
        };
        visit('src');
        expect(offenders).toEqual([]);
    });

    it('no reference to Sora or Manrope remains in src, outside this test', () => {
        const hits: string[] = [];
        let scanned = 0;
        const visit = (dir: string) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const name = entry.name;
                const path = join(dir, name);
                if (entry.isDirectory()) visit(path);
                else if (/\.(tsx?|css|md|txt)$/.test(name) && !path.endsWith('font-imports.test.ts')) {
                    scanned++;
                    if (/\b(sora|manrope)\b/i.test(readFileSync(path, 'utf8'))) hits.push(path);
                }
            }
        };
        visit('src');
        expect(scanned).toBeGreaterThan(100);
        expect(hits).toEqual([]);
    });
});
