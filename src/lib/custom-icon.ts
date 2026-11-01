// Custom type icons. Markup is never handed to the page as HTML. A document is parsed, an element
// tree is rebuilt from an allowlist, and that tree is what gets drawn and what gets sent. The list
// matches the API's sanitiser, which stays the authority: this is the fast local message and the
// guard on what is rendered.

export interface IconNode {
    tag: string;
    attrs: Record<string, string>;
    children: IconNode[];
}

export interface ParsedIcon {
    viewBox: string;
    nodes: IconNode[];
}

export type IconCheck = { ok: true; icon: ParsedIcon; svg: string } | { ok: false; error: string };

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_LENGTH = 16 * 1024;
const MAX_DEPTH = 16;

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);

const ATTRIBUTES: Record<string, readonly string[]> = {
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
const SAFE_VALUE = /^[A-Za-z0-9\s.,+\-()%]*$/;
const LONG_TOKEN = /[0-9.]{13,}/;

function isSafe(value: string): boolean {
    return SAFE_VALUE.test(value) && !LONG_TOKEN.test(value) && !/url\(/i.test(value);
}

function copy(from: Element, depth: number): { nodes: IconNode[]; shapes: number } {
    const nodes: IconNode[] = [];
    let shapes = 0;
    if (depth > MAX_DEPTH) return { nodes, shapes };

    for (const child of Array.from(from.children)) {
        if (child.namespaceURI !== SVG_NS && child.namespaceURI !== null) continue;
        const tag = child.localName;
        const isShape = SHAPES.has(tag);
        if (!isShape && tag !== 'g') continue;

        const attrs: Record<string, string> = {};
        for (const attribute of Array.from(child.attributes)) {
            if (attribute.namespaceURI !== null) continue;
            if (!ATTRIBUTES[tag].includes(attribute.name)) continue;
            if (!isSafe(attribute.value)) continue;
            attrs[attribute.name] = attribute.value;
        }

        let children: IconNode[] = [];
        if (isShape) {
            attrs.fill = 'currentColor';
            shapes += 1;
        } else {
            const inner = copy(child, depth + 1);
            children = inner.nodes;
            shapes += inner.shapes;
        }
        nodes.push({ tag, attrs, children });
    }
    return { nodes, shapes };
}

function serialise(node: IconNode): string {
    const attrs = Object.entries(node.attrs)
        .map(([name, value]) => ` ${name}="${value}"`)
        .join('');
    return node.children.length === 0
        ? `<${node.tag}${attrs}/>`
        : `<${node.tag}${attrs}>${node.children.map(serialise).join('')}</${node.tag}>`;
}

/** The markup as it is sent and stored: only what survived the allowlist. */
export function iconMarkup(icon: ParsedIcon): string {
    return `<svg xmlns="${SVG_NS}" viewBox="${icon.viewBox}">${icon.nodes.map(serialise).join('')}</svg>`;
}

/**
 * Checks pasted SVG and rebuilds it clean. A viewBox and at least one shape are required. Scripts,
 * styles, `fill`, `stroke` and `on*` attributes are not on the list, so they are gone, and every
 * shape is filled with `currentColor`.
 */
export function checkCustomSvg(source: string): IconCheck {
    const text = source.trim();
    if (!text) return { ok: false, error: 'Paste an SVG first.' };
    if (text.length > MAX_LENGTH) {
        return { ok: false, error: `The SVG is ${text.length} characters. The most allowed is ${MAX_LENGTH}.` };
    }
    if (/<!(DOCTYPE|ENTITY)/i.test(text)) {
        return { ok: false, error: 'A DOCTYPE or entities are not accepted.' };
    }

    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || doc.getElementsByTagName('parsererror').length > 0) {
        return { ok: false, error: 'That is not well-formed SVG.' };
    }
    if (root.localName !== 'svg' || (root.namespaceURI !== SVG_NS && root.namespaceURI !== null)) {
        return { ok: false, error: 'The root element has to be an svg.' };
    }

    const viewBox = root.getAttribute('viewBox');
    if (!viewBox || !viewBox.trim()) return { ok: false, error: 'The SVG needs a viewBox.' };
    if (!VIEW_BOX.test(viewBox)) {
        return { ok: false, error: 'The viewBox has to be four numbers: min-x min-y width height.' };
    }

    const { nodes, shapes } = copy(root, 1);
    if (shapes === 0) {
        return { ok: false, error: 'The SVG needs a shape: path, circle, ellipse, rect, line, polyline or polygon.' };
    }

    const icon = { viewBox: viewBox.trim(), nodes };
    return { ok: true, icon, svg: iconMarkup(icon) };
}

// Registered symbols. The id is handed out while rendering and the sprite is told in an effect, so
// no component is updated by another one's render.

const registered = new Map<string, { id: string; icon: ParsedIcon } | null>();
let counter = 0;
let snapshot: { id: string; icon: ParsedIcon }[] = [];
const listeners = new Set<() => void>();

/**
 * The symbol id for stored markup, or null when it does not pass the same check a paste does.
 * Stored markup is checked again here rather than trusted, so what is drawn is always a rebuilt tree.
 */
export function reserveCustomIcon(svg: string): string | null {
    const known = registered.get(svg);
    if (known !== undefined) return known?.id ?? null;

    const check = checkCustomSvg(svg);
    if (!check.ok) {
        registered.set(svg, null);
        return null;
    }
    counter += 1;
    const entry = { id: `ic-custom-${counter}`, icon: check.icon };
    registered.set(svg, entry);
    return entry.id;
}

/** Makes every reserved symbol visible to the sprite. */
export function publishCustomIcons() {
    const all = Array.from(registered.values()).filter((e): e is { id: string; icon: ParsedIcon } => e !== null);
    if (all.length === snapshot.length) return;
    snapshot = all;
    listeners.forEach((l) => l());
}

export function subscribeCustomIcons(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function customIconSnapshot() {
    return snapshot;
}
