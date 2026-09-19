import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
];

const run = (env: Record<string, string> = {}) =>
    execFileSync('sh', ['entrypoint.sh', 'true'], {
        cwd: dir,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

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
    write('.next/server/app/login.html', `<script src="${PLACEHOLDER}/env-config.js"></script>`);
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('entrypoint.sh writes the base path in at start', () => {
    it('the fixture carries the placeholder in every file a rewrite has to reach', () => {
        expect(FILES).toHaveLength(5);
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

    it('starting the same container again changes nothing', () => {
        run({ BARAKO_BASE_PATH: '/barakocms' });
        const after = FILES.map((file) => read(file));
        expect(after).toHaveLength(5);
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
