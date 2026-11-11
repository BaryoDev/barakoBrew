/**
 * The local check on a custom content type icon, and the registry it is drawn from.
 *
 * The API sanitises an icon on write and returns the cleaned markup (BaryoDev/barakoCMS#1243). This
 * does the same locally for two reasons: a pasted SVG that cannot work is refused before a request,
 * and stored markup is never trusted on arrival. Either way markup is parsed into plain data, a
 * viewBox and a tree of allowlisted shapes, and the console draws that data as React elements
 * through a registered symbol. No string of markup reaches the DOM.
 */

export interface IconNode {
    tag: 'g' | 'path' | 'circle' | 'ellipse' | 'rect' | 'line' | 'polyline' | 'polygon';
    attrs: Record<string, string>;
    children: IconNode[];
}

export interface IconSymbol {
    viewBox: string;
    nodes: IconNode[];
}

export type IconCheck = { ok: true; symbol: IconSymbol; svg: string } | { ok: false; error: string };

/** Mirrors the API's rule: the longest SVG accepted, in characters. */
export const MAX_SVG_LENGTH = 16 * 1024;
const MAX_DEPTH = 16;

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);

// What each element may keep. Everything else, including fill, stroke, style, href and every on*
// handler, is dropped.
const ATTRIBUTES: Record<string, string[]> = {
    g: ['transform', 'opacity'],
    path: ['d', 'transform', 'opacity', 'fill-rule', 'clip-rule'],
    circle: ['cx', 'cy', 'r', 'transform', 'opacity'],
    ellipse: ['cx', 'cy', 'rx', 'ry', 'transform', 'opacity'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'transform', 'opacity'],
    line: ['x1', 'y1', 'x2', 'y2', 'transform', 'opacity'],
    polyline: ['points', 'transform', 'opacity'],
    polygon: ['points', 'transform', 'opacity', 'fill-rule'],
};

const VIEW_BOX = /^\s*-?\d+(\.\d+)?[\s,]+-?\d+(\.\d+)?[\s,]+\d+(\.\d+)?[\s,]+\d+(\.\d+)?\s*$/;
const VALUE = /^[A-Za-z0-9\s.,+\-()%]*$/;

export const NOT_AN_ICON =
    'That is not an SVG with a viewBox and at least one path, circle, rect or polygon. Scripts, styles, images and event attributes are stripped, and every shape is drawn in the text colour.';

function clean(el: Element, depth: number): IconNode | null {
    const tag = el.localName.toLowerCase();
    if (tag !== 'g' && !SHAPES.has(tag)) return null;
    if (depth > MAX_DEPTH) return null;

    const attrs: Record<string, string> = {};
    for (const name of ATTRIBUTES[tag]) {
        const value = el.getAttribute(name);
        if (value !== null && VALUE.test(value)) attrs[name] = value;
    }

    const children: IconNode[] = [];
    if (tag === 'g') {
        for (const child of Array.from(el.children)) {
            const node = clean(child, depth + 1);
            if (node) children.push(node);
        }
    }
    return { tag: tag as IconNode['tag'], attrs, children };
}

function hasShape(nodes: IconNode[]): boolean {
    return nodes.some((n) => n.tag !== 'g' || hasShape(n.children));
}

function serialiseNode(node: IconNode): string {
    const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${v}"`);
    if (node.tag === 'g') return `<g${attrs.join('')}>${node.children.map(serialiseNode).join('')}</g>`;
    return `<${node.tag}${attrs.join('')} fill="currentColor"/>`;
}

/** Cleaned markup for the API, shapes forced to currentColor. Built only from an IconSymbol. */
export function serialiseIcon(symbol: IconSymbol): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.viewBox}">${symbol.nodes.map(serialiseNode).join('')}</svg>`;
}

/**
 * Parses and cleans pasted markup. Refused without a viewBox, without at least one shape, or when
 * it is not an SVG document. Scripts, styles, fill, stroke and on* attributes are not carried over
 * because only allowlisted elements and attributes are copied.
 */
export function checkSvg(raw: string): IconCheck {
    const known = checked.get(raw);
    if (known) return known;
    const result = parseSvg(raw);
    // A bounded memo: a list of types re-checks the same stored markup on every render.
    if (checked.size >= 200) checked.clear();
    checked.set(raw, result);
    return result;
}

const checked = new Map<string, IconCheck>();

// A DTD has no place in an icon and is what an entity expansion needs, so it is refused before the
// parser sees it, whatever the parser would have done with it.
const DTD = /<!\s*(doctype|entity)/i;

function parseSvg(raw: string): IconCheck {
    const text = raw.trim();
    if (!text || text.length > MAX_SVG_LENGTH || DTD.test(text)) return { ok: false, error: NOT_AN_ICON };

    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
        return { ok: false, error: NOT_AN_ICON };
    }

    const viewBox = root.getAttribute('viewBox');
    if (!viewBox || !VIEW_BOX.test(viewBox)) return { ok: false, error: NOT_AN_ICON };

    const nodes: IconNode[] = [];
    for (const child of Array.from(root.children)) {
        const node = clean(child, 1);
        if (node) nodes.push(node);
    }
    if (!hasShape(nodes)) return { ok: false, error: NOT_AN_ICON };

    const symbol = { viewBox: viewBox.trim(), nodes };
    return { ok: true, symbol, svg: serialiseIcon(symbol) };
}

const symbols = new Map<string, IconSymbol>();
const ids = new Map<string, string>();

/** Registers a checked symbol and answers its id, `ic-custom-N`. The same shapes keep one id. */
export function registerIcon(symbol: IconSymbol): string {
    const key = serialiseIcon(symbol);
    const known = ids.get(key);
    if (known) return known;
    const id = `ic-custom-${ids.size + 1}`;
    ids.set(key, id);
    symbols.set(id, symbol);
    return id;
}

/** The registered symbol for an id, or undefined. */
export function registeredIcon(id: string): IconSymbol | undefined {
    return symbols.get(id);
}
