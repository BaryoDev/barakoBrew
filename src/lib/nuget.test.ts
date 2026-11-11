import { describe, it, expect, vi } from 'vitest';
import {
    NUGET_MAX_PACKAGES,
    NUGET_PAGE_SIZE,
    fetchModulePackages,
    httpsUrl,
    parseSearchPage,
    searchUrl,
} from './nuget';

const row = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    version: '1.0.0',
    title: id,
    description: 'A module.',
    owners: ['someone'],
    totalDownloads: 10,
    tags: ['barakocms-module'],
    ...extra,
});

describe('reading a NuGet search page', () => {
    it('keeps a package id of BarakoCMS.__proto__ as plain data and pollutes nothing', () => {
        const { packages } = parseSearchPage({ totalHits: 1, data: [row('BarakoCMS.__proto__')] });
        expect(packages).toHaveLength(1);
        expect(packages[0].id).toBe('BarakoCMS.__proto__');
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(Object.getPrototypeOf(packages[0])).toBe(Object.prototype);
    });

    it('drops an id that is not a plain NuGet id, so it never reaches a shell line or a URL', () => {
        const { packages } = parseSearchPage({
            totalHits: 4,
            data: [row('X; rm -rf /'), row('A/../B'), row('<img src=x>'), row('Good.Module')],
        });
        expect(packages.map((p) => p.id)).toEqual(['Good.Module']);
    });

    it('returns a description holding a script tag as the same string, for a component to render as text', () => {
        const { packages } = parseSearchPage({ totalHits: 1, data: [row('A.B', { description: '<script>alert(1)</script>' })] });
        expect(packages).toHaveLength(1);
        expect(packages[0].description).toBe('<script>alert(1)</script>');
    });

    it('drops a javascript: projectUrl and keeps an https: one', () => {
        const { packages } = parseSearchPage({
            totalHits: 3,
            data: [
                row('A.One', { projectUrl: 'javascript:alert(1)' }),
                row('A.Two', { projectUrl: 'https://example.com/x' }),
                row('A.Three', { projectUrl: 'http://example.com/x' }),
            ],
        });
        expect(packages).toHaveLength(3);
        expect(packages.map((p) => p.projectUrl)).toEqual([null, 'https://example.com/x', null]);
    });

    it('never carries iconUrl, and builds the NuGet link from the id instead of taking one', () => {
        const { packages } = parseSearchPage({
            totalHits: 1,
            data: [row('A.B', { iconUrl: 'https://tracker.example/pixel.png', licenseUrl: 'javascript:1' })],
        });
        expect(packages).toHaveLength(1);
        expect(JSON.stringify(packages[0])).not.toContain('tracker.example');
        expect(packages[0].nugetUrl).toBe('https://www.nuget.org/packages/A.B');
    });

    it('caps text lengths and strips control characters', () => {
        const { packages } = parseSearchPage({
            totalHits: 1,
            data: [row('A.B', { description: 'x'.repeat(5000), title: 'a\u0000b‮c' })],
        });
        expect(packages[0].description).toHaveLength(500);
        expect(packages[0].title).toBe('a b c');
    });

    it('keeps a package id seen twice once, in any case', () => {
        const { packages } = parseSearchPage({ totalHits: 2, data: [row('A.B'), row('a.b')] });
        expect(packages).toHaveLength(1);
    });

    it.each([['an HTML string', '<html>captive portal</html>'], ['null', null], ['no data list', { totalHits: 3 }], ['data that is not a list', { data: {} }]])(
        'refuses %s as a search response',
        (_label, body) => {
            expect(() => parseSearchPage(body)).toThrow();
        },
    );

    it('reads a downloads value that is not a number as unknown rather than 0 or NaN', () => {
        const { packages } = parseSearchPage({ totalHits: 2, data: [row('A.One', { totalDownloads: 'many' }), row('A.Two', { totalDownloads: -5 })] });
        expect(packages.map((p) => p.downloads)).toEqual([null, null]);
    });

    it('reads the publisher from owners, then authors as a list or a string', () => {
        const { packages } = parseSearchPage({
            totalHits: 3,
            data: [row('A.One', { owners: [], authors: ['Ana'] }), row('A.Two', { owners: undefined, authors: 'Ben' }), row('A.Three', { owners: ['Cy'], authors: ['Di'] })],
        });
        expect(packages.map((p) => p.publisher)).toEqual(['Ana', 'Ben', 'Cy']);
    });
});

describe('httpsUrl', () => {
    it.each([['javascript:alert(1)'], ['data:text/html,<script>1</script>'], ['http://example.com'], ['//example.com'], ['not a url'], [42], [null]])(
        'rejects %s',
        (value) => {
            expect(httpsUrl(value)).toBeNull();
        },
    );
    it('accepts https', () => {
        expect(httpsUrl('https://example.com/a')).toBe('https://example.com/a');
    });
});

describe('fetching the packages', () => {
    const page = (ids: string[], totalHits: number) =>
        ({ ok: true, status: 200, json: async () => ({ totalHits, data: ids.map((id) => row(id)) }) }) as Response;

    it('asks for the tag, a bounded page, no credentials and no referrer', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(page(['A.One'], 1));
        await fetchModulePackages(fetchImpl);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe(searchUrl(0));
        expect(new URL(url).searchParams.get('q')).toBe('tags:barakocms-module');
        expect(new URL(url).searchParams.get('take')).toBe(String(NUGET_PAGE_SIZE));
        expect(init.credentials).toBe('omit');
        expect(init.referrerPolicy).toBe('no-referrer');
        expect(init.headers.Authorization).toBeUndefined();
    });

    it('stops at the cap and says the list was cut', async () => {
        let n = 0;
        const fetchImpl = vi.fn().mockImplementation(async () =>
            page(Array.from({ length: NUGET_PAGE_SIZE }, () => `Pkg.N${n++}`), 5000),
        );
        const result = await fetchModulePackages(fetchImpl);
        expect(result.packages).toHaveLength(NUGET_MAX_PACKAGES);
        expect(fetchImpl).toHaveBeenCalledTimes(NUGET_MAX_PACKAGES / NUGET_PAGE_SIZE);
        expect(result.totalHits).toBe(5000);
        expect(result.truncated).toBe(true);
    });

    it('is not truncated when everything fit', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(page(['A.One', 'A.Two'], 2));
        const result = await fetchModulePackages(fetchImpl);
        expect(result.packages).toHaveLength(2);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(result.truncated).toBe(false);
    });

    it('does not loop when a page repeats the same packages', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(page(['A.One'], 500));
        const result = await fetchModulePackages(fetchImpl);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(result.packages).toHaveLength(1);
    });

    it('rejects on a non-200 and on a body that is not JSON', async () => {
        await expect(fetchModulePackages(vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response))).rejects.toThrow();
        await expect(
            fetchModulePackages(vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } } as unknown as Response)),
        ).rejects.toThrow();
    });
});
