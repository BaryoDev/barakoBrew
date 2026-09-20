/**
 * Widths the API resizes to. `?w=` is snapped up to the next rung, so asking for anything else only
 * adds a cache miss on the server. Copied from docs/image-variants.md in barakoCMS.
 */
export const VARIANT_LADDER = [160, 320, 640, 960, 1280, 1920] as const;

/**
 * The formats the API resizes. GIF and AVIF are served at full size even with a `?w=` (GIF because
 * an animated one resamples every frame, AVIF because ImageSharp cannot decode it), and so is a PDF.
 */
const RESIZABLE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** The highest density a srcset offers a rung for. Beyond 3x the extra bytes buy nothing visible. */
const MAX_DENSITY = 3;

export interface ImageFile {
    id: string;
    contentType: string;
    isPublic: boolean;
}

export interface ImageVariantSource {
    src: string;
    /** Set only for a public file the API can resize. */
    srcSet?: string;
    sizes?: string;
    /**
     * The route needs a bearer token. An `<img>` cannot send one, so the caller fetches `src` through
     * the API client instead of handing it to the element.
     */
    authenticated: boolean;
}

export function isResizableImage(contentType: string): boolean {
    const type = contentType.toLowerCase();
    return RESIZABLE_TYPES.some((allowed) => type.startsWith(allowed));
}

/** The smallest rung at least this many pixels wide, or the top rung when none is. */
export function snapToLadder(width: number): number {
    return VARIANT_LADDER.find((rung) => rung >= width) ?? VARIANT_LADDER[VARIANT_LADDER.length - 1];
}

function fileRoute(file: ImageFile, apiUrl: string): string {
    const base = apiUrl.replace(/\/+$/, '');
    return file.isPublic ? `${base}/api/public/files/${file.id}` : `${base}/api/files/${file.id}`;
}

/**
 * Where to load an image from when it is drawn `width` CSS pixels wide.
 *
 * A public file gets the anonymous route and a srcset, so the browser picks the rung for its own
 * pixel density. A private file gets one URL on the authenticated route, sized for `density`, since
 * a srcset of URLs the element cannot authenticate is no use. A file the API does not resize gets
 * its original and no `?w=`.
 */
export function imageVariantSrcSet(
    file: ImageFile,
    apiUrl: string,
    { width, density = 1 }: { width: number; density?: number },
): ImageVariantSource {
    const route = fileRoute(file, apiUrl);
    const authenticated = !file.isPublic;

    if (!isResizableImage(file.contentType)) return { src: route, authenticated };

    if (authenticated) {
        return { src: `${route}?w=${snapToLadder(width * density)}`, authenticated };
    }

    const smallest = snapToLadder(width);
    const largest = snapToLadder(width * MAX_DENSITY);
    const rungs = VARIANT_LADDER.filter((rung) => rung >= smallest && rung <= largest);
    return {
        src: `${route}?w=${smallest}`,
        srcSet: rungs.map((rung) => `${route}?w=${rung} ${rung}w`).join(', '),
        sizes: `${width}px`,
        authenticated,
    };
}

/**
 * The one rung to load when the file is shown as large as the screen allows.
 *
 * No srcset: the viewer draws a single element at a size it already knows, so the browser has
 * nothing left to choose. Density is folded into the width here rather than left to the element,
 * which is also what makes a private file, whose bytes come through the API client, get the same
 * rung as a public one.
 */
export function viewerVariantSource(
    file: ImageFile,
    apiUrl: string,
    { screenWidth, density = 1 }: { screenWidth: number; density?: number },
): ImageVariantSource {
    const route = fileRoute(file, apiUrl);
    const authenticated = !file.isPublic;
    if (!isResizableImage(file.contentType)) return { src: route, authenticated };
    return { src: `${route}?w=${snapToLadder(Math.round(screenWidth * density))}`, authenticated };
}
