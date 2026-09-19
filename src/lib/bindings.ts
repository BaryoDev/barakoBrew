/**
 * The binding syntax a block prop may hold: `{{scope.Path | format ?? fallback}}`.
 *
 * It is barakoCMS's workflow template syntax with a format and a fallback on the end, and this file
 * is the console's half of it: read what is stored, write what a picker builds, and say what is
 * wrong with either. There is no evaluation here. The console never resolves a binding; barakoPress
 * does that on the server as the request's tenant, and the console only ever shows the placeholder.
 *
 * The scan matches barakoPress `src/blocks/bindings.ts` exactly: two braces, a bounded run of
 * characters that are not braces, two braces. One quantifier and nothing optional beside it, so
 * there is one way to match at any position and no backtracking. What is between the braces is then
 * read with indexOf and slice. A placeholder this cannot read is left alone, which is what lets an
 * editor see the typo.
 */

/** The whole placeholder, and the pieces the picker edits. */
export interface Binding {
    /** The placeholder exactly as it is stored, so a caller can show or remove what was written. */
    raw: string;
    scope: string;
    /** The path inside the scope, dots and all, for example "Author.Name". Empty for "{{site}}". */
    path: string;
    format: string;
    fallback: string;
}

const PLACEHOLDER = /\{\{[^{}]{0,250}\}\}/g;
const PATH = /^[A-Za-z0-9_]{1,60}(?:\.[A-Za-z0-9_]{1,60}){0,8}$/;
const SEGMENT = /^[A-Za-z0-9_]{1,60}(?:\.[A-Za-z0-9_]{1,60}){0,7}$/;
const FORMAT = /^[A-Za-z][A-Za-z0-9]{0,15}$/;

/** The longest fallback a placeholder may carry. Longer, and barakoPress does not read it as one. */
export const MAX_FALLBACK = 200;

/** The longest value barakoPress scans for placeholders. Beyond it, none are found at all. */
export const MAX_TEMPLATE = 4000;

/** The format a placeholder means when it names none. */
export const DEFAULT_FORMAT = 'text';

function parse(raw: string): Binding | null {
    let rest = raw.slice(2, -2);

    let fallback = '';
    const question = rest.indexOf('??');
    if (question !== -1) {
        fallback = rest.slice(question + 2).trim();
        if (fallback.length > MAX_FALLBACK) return null;
        rest = rest.slice(0, question);
    }

    let format = DEFAULT_FORMAT;
    const bar = rest.indexOf('|');
    if (bar !== -1) {
        format = rest.slice(bar + 1).trim();
        if (!FORMAT.test(format)) return null;
        rest = rest.slice(0, bar);
    }

    const path = rest.trim();
    if (!PATH.test(path)) return null;

    // A scope with no path after it ("{{site}}") is read the same way barakoPress reads it: a
    // binding, with a path of nothing, which resolves to nothing and renders its fallback.
    const [scope, ...segments] = path.split('.');
    return { raw, scope, path: segments.join('.'), format, fallback };
}

/** Every placeholder in a stored value, in order. A value that is not a string holds none. */
export function readBindings(value: unknown): Binding[] {
    if (typeof value !== 'string' || value.length > MAX_TEMPLATE) return [];
    const found: Binding[] = [];
    for (const match of value.matchAll(PLACEHOLDER)) {
        const binding = parse(match[0]);
        if (binding) found.push(binding);
    }
    return found;
}

export function hasBinding(value: unknown): boolean {
    return readBindings(value).length > 0;
}

/**
 * The placeholder for a scope, a path, a format and a fallback.
 *
 * `text` is left out, because it is what a placeholder with no format already means, and a shorter
 * placeholder is a smaller thing to read on a page full of them.
 */
export function bindingText(parts: { scope: string; path: string; format?: string; fallback?: string }): string {
    const format = parts.format && parts.format !== DEFAULT_FORMAT ? ` | ${parts.format}` : '';
    const fallback = parts.fallback ? ` ?? ${parts.fallback}` : '';
    return `{{${parts.scope}.${parts.path}${format}${fallback}}}`;
}

/**
 * Why a path cannot be used in a placeholder, or null when it can.
 *
 * Reported rather than silently corrected: a person typing `query.class name` has to see that the
 * space is the problem, not watch the binding vanish.
 */
export function pathProblem(path: string): string | null {
    const trimmed = path.trim();
    if (!trimmed) return 'Pick or type a field.';
    if (!SEGMENT.test(trimmed)) {
        return 'Letters, numbers and underscores, separated by dots. No spaces.';
    }
    return null;
}

/**
 * Why a fallback cannot be used, or null when it can.
 *
 * A brace is the hard one: the placeholder ends at the first `}}`, so a fallback holding a brace
 * would be read as something else entirely, or not read as a placeholder at all.
 */
export function fallbackProblem(fallback: string): string | null {
    if (fallback.includes('{') || fallback.includes('}')) return 'A fallback cannot hold { or }.';
    if (fallback.length > MAX_FALLBACK) return `A fallback is at most ${MAX_FALLBACK} characters.`;
    return null;
}

/**
 * The value with every placeholder swapped for the most harmless thing of its kind.
 *
 * barakoPress checks a bindable prop this way before it renders, so the console checks it the same
 * way: `{{site.Url}}` in a link field is a link, and `javascript:{{site.Url}}` is not, whatever the
 * binding turns out to hold. What it does turn out to hold is checked again on the server.
 */
export function withoutBindings(value: string, standIn: string): string {
    let out = value;
    for (const binding of readBindings(value)) out = out.split(binding.raw).join(standIn);
    return out;
}
