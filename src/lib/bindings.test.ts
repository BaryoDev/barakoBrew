import { describe, expect, it } from 'vitest';
import {
    bindingText,
    fallbackProblem,
    hasBinding,
    MAX_TEMPLATE,
    pathProblem,
    readBindings,
    withoutBindings,
} from './bindings';

describe('reading the bindings in a stored value', () => {
    it('reads a scope, a path, a format and a fallback', () => {
        expect(readBindings('Welcome to {{site.Name}}')).toEqual([
            { raw: '{{site.Name}}', scope: 'site', path: 'Name', format: 'text', fallback: '' },
        ]);
        expect(readBindings('{{item.PublishedAt | date ?? Not yet}}')).toEqual([
            {
                raw: '{{item.PublishedAt | date ?? Not yet}}',
                scope: 'item',
                path: 'PublishedAt',
                format: 'date',
                fallback: 'Not yet',
            },
        ]);
    });

    it('reads a path several segments deep, and every binding in one value', () => {
        const found = readBindings('{{item.Author.Name}} for {{query.class}}');
        expect(found).toHaveLength(2);
        expect(found.map((b) => `${b.scope}.${b.path}`)).toEqual(['item.Author.Name', 'query.class']);
    });

    it('leaves alone what is not a binding, so the typo stays visible', () => {
        expect(readBindings('{{ not a path }}')).toEqual([]);
        expect(readBindings('{{site.Name | 9bad}}')).toEqual([]);
        expect(readBindings('{ site.Name }')).toEqual([]);
        expect(hasBinding('plain words')).toBe(false);
    });

    it('splits the fallback off first, so a bar inside it stays part of it', () => {
        const [binding] = readBindings('{{site.Name ?? Ana | Ben}}');
        expect(binding.fallback).toBe('Ana | Ben');
        expect(binding.format).toBe('text');
    });

    it('finds nothing in a value longer than the site scans, the same as the site finds nothing', () => {
        const long = `${'a'.repeat(MAX_TEMPLATE)}{{site.Name}}`;
        expect(long.length).toBeGreaterThan(MAX_TEMPLATE);
        expect(readBindings(long)).toEqual([]);
    });

    it('holds none in a value that is not a string', () => {
        expect(readBindings(7)).toEqual([]);
        expect(readBindings(null)).toEqual([]);
    });
});

describe('writing a binding from what a picker collected', () => {
    it('leaves out the format that means nothing and the fallback that is empty', () => {
        expect(bindingText({ scope: 'site', path: 'Name' })).toBe('{{site.Name}}');
        expect(bindingText({ scope: 'site', path: 'Name', format: 'text', fallback: '' })).toBe('{{site.Name}}');
    });

    it('writes what it is handed, and reads back as the same binding', () => {
        const text = bindingText({ scope: 'item', path: 'Price', format: 'money', fallback: 'Ask us' });
        expect(text).toBe('{{item.Price | money ?? Ask us}}');
        const [binding] = readBindings(text);
        expect(binding).toMatchObject({ scope: 'item', path: 'Price', format: 'money', fallback: 'Ask us' });
    });
});

describe('what the picker refuses before it writes one', () => {
    it('refuses a path with a space or a symbol in it', () => {
        expect(pathProblem('Name')).toBeNull();
        expect(pathProblem('Author.Name')).toBeNull();
        expect(pathProblem('')).toMatch(/Pick or type/);
        expect(pathProblem('class name')).toMatch(/No spaces/);
        expect(pathProblem('Name!')).toMatch(/No spaces/);
    });

    it('refuses a fallback holding a brace, which would end the placeholder early', () => {
        expect(fallbackProblem('Not yet')).toBeNull();
        expect(fallbackProblem('a } b')).toMatch(/cannot hold/);
        expect(fallbackProblem('{{site.Name}}')).toMatch(/cannot hold/);
        expect(fallbackProblem('x'.repeat(201))).toMatch(/at most/);
    });
});

describe('checking a bindable prop the way the site checks it', () => {
    it('stands a placeholder in, so a bound link passes and a prefixed one does not', () => {
        expect(withoutBindings('{{site.Url}}', '/x')).toBe('/x');
        expect(withoutBindings('javascript:{{site.Url}}', '/x')).toBe('javascript:/x');
        expect(withoutBindings('{{site.Url}}/{{item.Slug}}', '/x')).toBe('/x//x');
    });

    it('leaves a value holding no binding exactly as it is', () => {
        expect(withoutBindings('/contact', '/x')).toBe('/contact');
    });
});
