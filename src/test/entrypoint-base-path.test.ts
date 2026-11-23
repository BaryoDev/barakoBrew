import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
    chmodSync,
    copyFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

/**
 * The console's base path used to be fixed when the image was built, because Next resolves
 * `basePath` and `assetPrefix` during the build. The published image is built against a placeholder
 * prefix instead, and `entrypoint.sh` writes the real one into the build output at container start.
 *
 * This runs the real `entrypoint.sh` against a fixture shaped like the runtime layout: the files
 * below are the four places the placeholder actually lands in a `next build --standalone` output,
 * taken from one. The whole point is that one image serves both the domain root and a prefix, so
 * both directions are asserted, and so is the trailing-slash redirect that makes the root case
 * different from a plain string substitution.
 */

const PLACEHOLDER = '/__BARAKO_BASE_PATH__';

// Trimmed from a real build. `redirects` carries the 308 Next emits for a basePath build; a build
// with no basePath has no such entry, which is why the root case cannot be a pure text replace.
const routesManifest = (prefix: string) => ({
    version: 3,
    basePath: prefix,
    redirects: [
        {
            source: `${prefix}/`,
            destination: prefix,
            basePath: false,
            internal: true,
            priority: true,
            statusCode: 308,
            regex: `^${prefix}/$`,
        },
        {
            source: '/:path+/',
            destination: '/:path+',
            internal: true,
            statusCode: 308,
            regex: '^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))/$',
        },
    ],
    rewrites: [],
});

let dir: string;

const write = (relative: string, contents: string) => {
    const target = join(dir, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, contents);
};

const read = (relative: string) => readFileSync(join(dir, relative), 'utf8');

// Every file a rewrite has to reach, and every file the assertions read back.
const FILES = [
    'server.js',
    '.next/routes-manifest.json',
    '.next/required-server-files.json',
    '.next/static/chunks/turbopack.js',
    '.next/server/app/login.html',
    '.next/server/functions-config-manifest.json',
];

const run = (env: Record<string, string> = {}) =>
    execFileSync('sh', ['entrypoint.sh', 'true'], {
        cwd: dir,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

// The message the entrypoint wrote when it refused, for the cases that must say why.
const refusal = (env: Record<string, string> = {}): string => {
    try {
        run(env);
    } catch (error) {
        return String((error as { stderr?: Buffer | string }).stderr ?? '');
    }
    throw new Error('the entrypoint was expected to refuse and did not');
};

// Tests below take write permission away from parts of the fixture, and rmSync needs it back.
const restoreModes = () => {
    try {
        execFileSync('chmod', ['-R', 'u+w', dir]);
    } catch {
        /* the directory is already gone */
    }
};

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brew-entrypoint-'));
    copyFileSync(join(process.cwd(), 'entrypoint.sh'), join(dir, 'entrypoint.sh'));
    mkdirSync(join(dir, 'public'), { recursive: true });

    write(
        'server.js',
        `const nextConfig = {"env":{"NEXT_PUBLIC_BASE_PATH":"${PLACEHOLDER}"},"assetPrefix":"${PLACEHOLDER}","basePath":"${PLACEHOLDER}"};\n`,
    );
    write('.next/routes-manifest.json', JSON.stringify(routesManifest(PLACEHOLDER), null, 2));
    write(
        '.next/required-server-files.json',
        JSON.stringify({ config: { basePath: PLACEHOLDER, assetPrefix: PLACEHOLDER } }, null, 2),
    );
    write(
        '.next/static/chunks/turbopack.js',
        `TURBOPACK_CHUNK_BASE_PATH:"${PLACEHOLDER}/_next/",r="${PLACEHOLDER}/login";\n`,
    );
    // The proxy matcher, as the build writes it: the placeholder sits behind an escaped slash.
    write(
        '.next/server/functions-config-manifest.json',
        JSON.stringify({
            version: 1,
            functions: {
                '/_middleware': {
                    runtime: 'nodejs',
                    matchers: [
                        {
                            regexp: `^\\/${PLACEHOLDER.slice(1)}(?:\\/(_next\\/data\\/[^/]{1,}))?(?:\\/((?!_next\\/static|_next\\/image).*))(\\.json|\\.rsc)?[\\/#\\?]?$`,
                        },
                    ],
                },
            },
        }),
    );
    write('.next/server/app/login.html', `<script src="${PLACEHOLDER}/env-config.js"></script>`);
});

afterEach(() => {
    restoreModes();
    rmSync(dir, { recursive: true, force: true });
});

describe('entrypoint.sh writes the base path in at start', () => {
    it('the fixture carries the placeholder in every file a rewrite has to reach', () => {
        expect(FILES).toHaveLength(6);
        for (const file of FILES) {
            expect(read(file), file).toContain(PLACEHOLDER);
        }
    });

    it('BARAKO_BASE_PATH replaces the placeholder everywhere', () => {
        run({ BARAKO_BASE_PATH: '/barakocms' });

        for (const file of FILES) {
            expect(read(file), file).not.toContain(PLACEHOLDER);
        }
        expect(read('server.js')).toContain('"basePath":"/barakocms"');
        expect(read('server.js')).toContain('"assetPrefix":"/barakocms"');
        expect(read('.next/static/chunks/turbopack.js')).toContain('"/barakocms/_next/"');
        expect(read('.next/server/app/login.html')).toContain('"/barakocms/env-config.js"');
        expect(read('.next/required-server-files.json')).toContain('"/barakocms"');
    });

    it('a prefixed console keeps the 308 from the prefix with a trailing slash', () => {
        run({ BARAKO_BASE_PATH: '/barakocms' });

        const manifest = JSON.parse(read('.next/routes-manifest.json'));
        expect(manifest.redirects).toHaveLength(2);
        expect(manifest.redirects[0]).toMatchObject({
            source: '/barakocms/',
            destination: '/barakocms',
            statusCode: 308,
        });
    });

    it('no BARAKO_BASE_PATH serves the domain root', () => {
        run();

        for (const file of FILES) {
            expect(read(file), file).not.toContain(PLACEHOLDER);
        }
        expect(read('server.js')).toContain('"basePath":""');
        expect(read('.next/static/chunks/turbopack.js')).toContain('"/_next/"');
        expect(read('.next/server/app/login.html')).toContain('"/env-config.js"');
    });

    it('the root drops the redirect that would otherwise send / to an empty address', () => {
        run();

        const manifest = JSON.parse(read('.next/routes-manifest.json'));
        expect(manifest.redirects).toHaveLength(1);
        expect(manifest.redirects.map((r: { source: string }) => r.source)).not.toContain('/');
        expect(manifest.redirects[0].source).toBe('/:path+/');
    });

    it('a trailing slash on the value is dropped, so /clients/acme/ and /clients/acme agree', () => {
        run({ BARAKO_BASE_PATH: '/clients/acme/' });

        expect(read('server.js')).toContain('"basePath":"/clients/acme"');
        expect(read('.next/server/app/login.html')).toContain('"/clients/acme/env-config.js"');
    });

    it('a value that is not a path is refused rather than written into the bundle', () => {
        expect(() => run({ BARAKO_BASE_PATH: '/x";alert(1);//' })).toThrow();

        // Refused means refused: the build output is still the placeholder, not half rewritten.
        expect(read('server.js')).toContain(PLACEHOLDER);
        expect(read('server.js')).not.toContain('alert(1)');
    });

    it('a value that spans lines is refused, even when its first line is a valid path', () => {
        const before = read('server.js');
        const stderr = refusal({ BARAKO_BASE_PATH: '/ok\n/x' });

        expect(stderr).toContain('BARAKO_BASE_PATH must be one or more /segments');
        expect(read('server.js')).toBe(before);
    });

    it('a value with a trailing newline is refused', () => {
        expect(refusal({ BARAKO_BASE_PATH: '/ok\n' })).toContain('BARAKO_BASE_PATH must be one or more /segments');
    });

    it('starting the same container again changes nothing', () => {
        run({ BARAKO_BASE_PATH: '/barakocms' });
        const after = FILES.map((file) => read(file));
        expect(after).toHaveLength(6);
        expect(after.every((contents) => contents.includes('/barakocms'))).toBe(true);

        run({ BARAKO_BASE_PATH: '/barakocms' });
        expect(FILES.map((file) => read(file))).toEqual(after);
    });

    it('still writes env-config.js from NEXT_PUBLIC_ values', () => {
        run({ BARAKO_BASE_PATH: '/barakocms', NEXT_PUBLIC_API_URL: 'https://api.example.test' });

        expect(read('public/env-config.js')).toContain(
            'NEXT_PUBLIC_API_URL: "https://api.example.test"',
        );
    });
});

describe('entrypoint.sh with BARAKO_RUNTIME_DIR leaves the image untouched', () => {
    let runtime: string;
    const readRuntime = (relative: string) => readFileSync(join(runtime, relative), 'utf8');

    beforeEach(() => {
        runtime = mkdtempSync(join(tmpdir(), 'brew-runtime-'));
        mkdirSync(join(dir, 'node_modules', 'next'), { recursive: true });
        writeFileSync(join(dir, 'node_modules', 'next', 'index.js'), 'module.exports = {};\n');
    });

    afterEach(() => {
        rmSync(runtime, { recursive: true, force: true });
    });

    it('rewrites the copy and not the files it copied from', () => {
        const before = FILES.map((file) => read(file));
        run({
            BARAKO_RUNTIME_DIR: runtime,
            BARAKO_BASE_PATH: '/barakocms',
            NEXT_PUBLIC_API_URL: 'https://api.example.test',
        });

        expect(FILES.map((file) => read(file))).toEqual(before);
        expect(() => readFileSync(join(dir, 'public', 'env-config.js'))).toThrow();

        for (const file of FILES) {
            expect(readRuntime(file), file).not.toContain(PLACEHOLDER);
        }
        expect(readRuntime('server.js')).toContain('"basePath":"/barakocms"');
        expect(readRuntime('public/env-config.js')).toContain('NEXT_PUBLIC_API_URL: "https://api.example.test"');
    });

    it('links node_modules instead of copying it', () => {
        run({ BARAKO_RUNTIME_DIR: runtime });

        expect(readRuntime('node_modules/next/index.js')).toContain('module.exports');
        expect(lstatSync(join(runtime, 'node_modules')).isSymbolicLink()).toBe(true);
    });

    it('starting again in the same runtime directory gives the same result', () => {
        run({ BARAKO_RUNTIME_DIR: runtime, BARAKO_BASE_PATH: '/barakocms' });
        const after = FILES.map((file) => readRuntime(file));
        expect(after).toHaveLength(6);

        run({ BARAKO_RUNTIME_DIR: runtime, BARAKO_BASE_PATH: '/barakocms' });
        expect(FILES.map((file) => readRuntime(file))).toEqual(after);

        // Without the rm before each copy, cp -R puts the source inside the existing directory.
        expect(existsSync(join(runtime, '.next', '.next'))).toBe(false);
        expect(existsSync(join(runtime, 'public', 'public'))).toBe(false);
    });

    it('copies from sources that are read-only and still rewrites the copies, twice', () => {
        execFileSync('chmod', ['-R', 'a-w', join(dir, 'server.js'), join(dir, '.next'), join(dir, 'public')]);

        run({ BARAKO_RUNTIME_DIR: runtime, BARAKO_BASE_PATH: '/barakocms' });
        run({ BARAKO_RUNTIME_DIR: runtime, BARAKO_BASE_PATH: '/barakocms' });

        for (const file of FILES) {
            expect(readRuntime(file), file).not.toContain(PLACEHOLDER);
        }
        expect(readRuntime('server.js')).toContain('"basePath":"/barakocms"');
        expect(readRuntime('public/env-config.js')).toContain('window._env_');
    });

    describe('a runtime directory that is, holds or reaches the app directory is refused', () => {
        const intact = () => {
            expect(read('server.js')).toContain(PLACEHOLDER);
            expect(existsSync(join(dir, '.next', 'routes-manifest.json'))).toBe(true);
            expect(existsSync(join(dir, 'public'))).toBe(true);
        };
        const link = () => {
            const target = join(runtime, 'link-to-app');
            symlinkSync(dir, target);
            return target;
        };

        const cases: Array<[string, () => string]> = [
            ['the app directory with a trailing slash', () => `${dir}/`],
            ['the app directory with a /. segment', () => `${dir}/.`],
            ['a .. path that comes back to the app directory', () => `${dir}/../${basename(dir)}`],
            ['a symlink to the app directory', link],
            ['the directory above the app directory', () => dirname(dir)],
            ['the root directory', () => '/'],
            ['a directory inside the app directory', () => join(dir, 'inside')],
        ];

        it.each(cases)('%s', (_name, value) => {
            const stderr = refusal({ BARAKO_RUNTIME_DIR: value() });

            expect(stderr).toContain('BARAKO_RUNTIME_DIR');
            intact();
        });
    });

    it('a runtime directory that is not an absolute path is refused', () => {
        expect(() => run({ BARAKO_RUNTIME_DIR: 'relative/path' })).toThrow();
    });
});

describe('entrypoint.sh with BARAKO_RUNTIME_DIR unset and an app directory it cannot write', () => {
    // Root can write anywhere, so the case cannot be set up as root.
    it.skipIf(process.getuid?.() === 0)('refuses, and says to set BARAKO_RUNTIME_DIR', () => {
        chmodSync(dir, 0o555);

        const stderr = refusal();

        expect(stderr).toContain('is not writable');
        expect(stderr).toContain('Set BARAKO_RUNTIME_DIR');
        expect(read('server.js')).toContain(PLACEHOLDER);
    });
});

describe('the proxy matcher survives the rewrite', () => {
    const matchers = () =>
        JSON.parse(read('.next/server/functions-config-manifest.json')).functions['/_middleware'].matchers as {
            regexp: string;
        }[];

    it('at the root it is still a valid expression that matches pages', () => {
        run();

        for (const { regexp } of matchers()) {
            const expression = new RegExp(regexp);
            expect(expression.test('/login')).toBe(true);
            expect(expression.test('/modules/A.B')).toBe(true);
        }
    });

    it('under a prefix it is a valid expression that matches the prefixed path only', () => {
        run({ BARAKO_BASE_PATH: '/barako' });

        for (const { regexp } of matchers()) {
            const expression = new RegExp(regexp);
            expect(expression.test('/barako/login')).toBe(true);
            expect(expression.test('/login')).toBe(false);
        }
    });
});
