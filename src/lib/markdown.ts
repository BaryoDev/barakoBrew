import { Marked, type Tokens } from 'marked';

/*
 * Markdown to HTML, treating the markdown as untrusted.
 *
 * This is barakoPress's renderer (src/markdown.ts in BaryoDev/barakoPress), carried over rule for
 * rule so the preview an author sees in the console matches the post a reader sees on the site.
 * It is copied rather than imported because the barakopress package exposes it only through its
 * root export, and that barrel also pulls in next/cache, next/server and node:crypto, none of which
 * belong in a browser bundle. Change one, change the other.
 *
 * Three rules:
 *   1. Raw HTML in the source is escaped, never passed through. That removes script tags, event
 *      handler attributes and iframes in one move, instead of trying to enumerate them.
 *   2. A link or image destination must be http, https or mailto. That kills javascript: and
 *      data: URLs, which are the two that execute.
 *   3. Text is escaped on the way into every attribute, so an alt or a title cannot close its own
 *      quote and add another attribute.
 */

const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

export function isSafeHref(href: string): boolean {
    const trimmed = href.trim();
    // A relative or anchor link has no scheme and cannot execute.
    if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true;
    try {
        return SAFE_SCHEMES.includes(new URL(trimmed).protocol);
    } catch {
        return false;
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function anchor(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
}

function buildRenderer() {
    const marked = new Marked({ gfm: true, breaks: false });

    marked.use({
        renderer: {
            html({ text }: Tokens.HTML | Tokens.Tag) {
                return escapeHtml(text);
            },
            link({ href, title, tokens }) {
                const label = this.parser.parseInline(tokens);
                // Keep the words, drop the destination. A reader still sees what was written.
                if (!isSafeHref(href)) return label;
                const t = title ? ` title="${escapeHtml(title)}"` : '';
                const external = /^https?:/.test(href.trim());
                const rel = external ? ' rel="noopener noreferrer"' : '';
                return `<a href="${escapeHtml(href.trim())}"${t}${rel}>${label}</a>`;
            },
            image({ href, title, text }) {
                if (!isSafeHref(href)) return escapeHtml(text ?? '');
                const t = title ? ` title="${escapeHtml(title)}"` : '';
                return `<img src="${escapeHtml(href.trim())}" alt="${escapeHtml(text ?? '')}"${t} loading="lazy">`;
            },
            heading({ tokens, depth }) {
                const label = this.parser.parseInline(tokens);
                const plain = tokens.map((t) => ('raw' in t ? t.raw : '')).join('');
                return `<h${depth} id="${escapeHtml(anchor(plain))}">${label}</h${depth}>`;
            },
        },
    });

    return marked;
}

const renderer = buildRenderer();

export function renderMarkdown(source: string): string {
    if (!source) return '';
    return renderer.parse(source, { async: false }) as string;
}
