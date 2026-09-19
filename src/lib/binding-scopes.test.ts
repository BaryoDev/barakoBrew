import { describe, expect, it } from 'vitest';
import { bindingProblems, pathsOf, scopesFor } from './binding-scopes';
import type { ContentTypeDefinition } from '@/types/schema';

const type = (name: string, fields: string[]): ContentTypeDefinition => ({
    name,
    displayName: name,
    fields: fields.map((f) => ({ name: f, displayName: f, type: 'string' as const, isRequired: false })),
});

const SITE = type('site', ['Name', 'Phone']);
const PAGE = type('page', ['Title', 'Intro']);
const CLASS = type('class', ['Teacher', 'Room']);

const PUBLISHED = ['site', 'page', 'item', 'query', 'props'];

describe('the paths a scope offers', () => {
    it('offers the content type fields and the names the site lays over them, without repeats', () => {
        const paths = pathsOf(SITE, 'site');
        expect(paths).not.toBeNull();
        expect(paths!.map((p) => p.path)).toEqual(['Name', 'Phone', 'Tagline', 'Url', 'Logo', 'Copyright']);
        expect(paths!.filter((p) => p.path === 'Name')).toHaveLength(1);
    });

    it('still offers the site names for a tenant with no such content type', () => {
        const paths = pathsOf(undefined, 'page');
        expect(paths).not.toBeNull();
        expect(paths!.map((p) => p.path)).toEqual(['Id', 'Title', 'Slug', 'Summary', 'Body']);
    });

    it('lists nothing for a scope with no fields to list, so the picker takes a typed name', () => {
        expect(pathsOf(undefined, 'query')).toBeNull();
    });
});

describe('the scopes offered at one spot', () => {
    it('offers exactly what the site published, in the order it published them', () => {
        const scopes = scopesFor(['site', 'query'], { insideData: false });
        expect(scopes.map((s) => s.name)).toEqual(['site', 'query']);
    });

    it('offers a scope the console has no wording for, rather than dropping it', () => {
        const [scope] = scopesFor(['audience'], { insideData: false });
        expect(scope.label).toBe('audience');
        expect(scope.paths).toBeNull();
        expect(scope.unavailable).toBeUndefined();
    });

    it('says the item scope holds nothing outside a data block, and lists its fields inside one', () => {
        const outside = scopesFor(PUBLISHED, { insideData: false }).find((s) => s.name === 'item')!;
        expect(outside.unavailable).toMatch(/loads content/);

        const inside = scopesFor(PUBLISHED, { insideData: true, itemType: CLASS }).find((s) => s.name === 'item')!;
        expect(inside.unavailable).toBeUndefined();
        expect(inside.paths!.map((p) => p.path)).toContain('Teacher');
    });

    it('marks a scope rendered per visitor, so the note reaches the person binding it', () => {
        const viewer = scopesFor(['viewer'], { insideData: false })[0];
        expect(viewer.perVisitor).toBe(true);
    });
});

describe('what is wrong with the bindings in a value', () => {
    const scopes = scopesFor(PUBLISHED, { siteType: SITE, pageType: PAGE, insideData: false });

    it('says nothing about a binding that names a field the type still has', () => {
        expect(bindingProblems('Welcome to {{site.Name}}', scopes)).toEqual([]);
        expect(bindingProblems('{{page.Title}} and {{site.Phone}}', scopes)).toEqual([]);
    });

    it('marks a field the content type no longer declares, with what the page will show instead', () => {
        const problems = bindingProblems('Call {{site.Mobile ?? the office}}', scopes);
        expect(problems).toHaveLength(1);
        expect(problems[0].binding).toBe('{{site.Mobile ?? the office}}');
        expect(problems[0].message).toContain('no field called "Mobile"');
        expect(problems[0].message).toContain('the page shows "the office"');
    });

    it('says the page shows nothing when the binding carries no fallback', () => {
        const [problem] = bindingProblems('{{page.Headline}}', scopes);
        expect(problem.message).toContain('the page shows nothing here');
    });

    it('marks a scope this site does not publish at all', () => {
        const [problem] = bindingProblems('{{viewer.Name}}', scopes);
        expect(problem.message).toContain('nothing called "viewer"');
    });

    it('marks a scope that holds nothing here, rather than calling the field missing', () => {
        const [problem] = bindingProblems('{{item.Teacher}}', scopes);
        expect(problem.message).toMatch(/loads content/);
    });

    it('leaves a scope it cannot list alone, since the address carries whatever it carries', () => {
        expect(bindingProblems('{{query.class}}', scopes)).toEqual([]);
    });

    it('checks only the first segment, since a path into an object is the field own shape', () => {
        expect(bindingProblems('{{page.Intro.first}}', scopes)).toEqual([]);
        expect(bindingProblems('{{page.Missing.first}}', scopes)).toHaveLength(1);
    });
});
