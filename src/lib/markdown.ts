import { Marked, type Token, type Tokens } from 'marked';

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
 *   2. A link or image destination must be http, https or mailto, or a path on this site. That
 *      kills javascript: and data: URLs, which are the two that execute, and a //host link that
 *      leaves the site while looking relative.
 *   3. Text is escaped on the way into every attribute, so an alt or a title cannot close its own
 *      quote and add another attribute.
 */

const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

export function isSafeHref(href: string): boolean {
    const trimmed = href.trim();
    // A browser drops tabs and newlines inside a URL before reading it, so check what it will read.
    const read = trimmed.replace(/[\t\n\r]/g, '');
    // A character reference is decoded again wherever the href is read as HTML, so /&#47;host can
    // become //host after this check. A real destination does not need one.
    if (/&(#|[A-Za-z][A-Za-z0-9]*;)/.test(read)) return false;
    if (read.startsWith('#')) return true;
    // A path on this site. Two slashes, or a slash and a backslash, name another host instead.
    if (read.startsWith('/')) return !/^\/[/\\]/.test(read);
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

/*
 * The lexer marks text after an opening script, pre, style or textarea tag as already escaped, and
 * the default text renderer then writes it out as it came. With raw HTML escaped that tag never
 * reaches the page, so nothing protects the text after it. Every such token is sent back through
 * normal escaping, and every raw HTML token becomes plain escaped text before rendering, so no
 * renderer can pass either through.
 */
function escapeRawTokens(token: Token) {
    if (token.type === 'html') {
        Object.assign(token, { type: 'text', text: escapeHtml(token.text), escaped: true });
        return;
    }
    if ('escaped' in token && token.escaped) token.escaped = false;
}

function buildRenderer() {
    const marked = new Marked({ gfm: true, breaks: false });

    marked.use({
        walkTokens: escapeRawTokens,
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
