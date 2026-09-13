import { describe, it, expect } from 'vitest';
import { isSafeHref, renderMarkdown } from './markdown';

function fragment(source: string) {
    const host = document.createElement('div');
    host.innerHTML = renderMarkdown(source);
    return host;
}

describe('renderMarkdown renders what an author writes', () => {
    it('renders headings, links and lists', () => {
        const html = fragment('# Spring roast\n\n- beans\n- water\n\n[Guide](https://example.com/guide)');
        expect(html.querySelector('h1')?.textContent).toBe('Spring roast');
        expect(html.querySelectorAll('li')).toHaveLength(2);
        const link = html.querySelector('a');
        expect(link?.getAttribute('href')).toBe('https://example.com/guide');
        expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('renders nothing for an empty source', () => {
        expect(renderMarkdown('')).toBe('');
    });
});

describe('renderMarkdown treats the source as untrusted', () => {
    it('keeps the words of a javascript: link and drops the link', () => {
        for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)']) {
            const html = fragment(`[click me](${href})`);
            expect(html.textContent).toContain('click me');
            expect(html.querySelectorAll('a')).toHaveLength(0);
        }
    });

    it('escapes a raw script tag into visible text', () => {
        const html = fragment('before\n\n<script>alert(1)</script>\n\nafter');
        expect(html.querySelectorAll('script')).toHaveLength(0);
        expect(html.textContent).toContain('<script>alert(1)</script>');
    });

    it('escapes inline HTML carrying an event handler', () => {
        const html = fragment('hello <img src=x onerror="alert(1)"> there');
        expect(html.querySelectorAll('img')).toHaveLength(0);
        expect(html.querySelectorAll('[onerror]')).toHaveLength(0);
    });

    it('drops a data: image and escapes its alt text', () => {
        const html = fragment('![x <script>alert(1)</script> y](data:text/html,boom)');
        expect(html.querySelectorAll('img')).toHaveLength(0);
        expect(html.querySelectorAll('script')).toHaveLength(0);
        expect(html.textContent).toContain('<script>');
    });

    it('cannot break out of an attribute through a title', () => {
        const html = fragment('[a](https://example.com "x\\" onmouseover=\\"alert(1)")');
        const link = html.querySelector('a');
        expect(link).not.toBeNull();
        expect(link?.hasAttribute('onmouseover')).toBe(false);
    });

    it('allows http, https, mailto, relative and anchor destinations only', () => {
        expect(isSafeHref('https://example.com')).toBe(true);
        expect(isSafeHref('http://example.com')).toBe(true);
        expect(isSafeHref('mailto:a@example.com')).toBe(true);
        expect(isSafeHref('/about')).toBe(true);
        expect(isSafeHref('#top')).toBe(true);
        expect(isSafeHref('data:text/html,x')).toBe(false);
        expect(isSafeHref('vbscript:x')).toBe(false);
    });
});
