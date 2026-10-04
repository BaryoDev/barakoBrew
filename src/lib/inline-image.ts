/**
 * The limits barakoCMS puts on an `inlineimage` field (docs/inline-image-fields.md), checked here so
 * an editor hears about them before the round trip. The server still checks everything, including
 * the image's pixel size and its signature bytes, which this does not.
 */
export const INLINE_IMAGE_MAX_BYTES = 64 * 1024;

export const INLINE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

export const INLINE_IMAGE_MAX_ALT = 500;

export const INLINE_IMAGE_RULES = 'PNG, JPEG, GIF or WebP, up to 64 KB. SVG is not accepted.';

/** What the field holds: the data URI and its alt text. */
export interface InlineImage {
    url: string;
    alt?: string | null;
}

/** Why the API would refuse this file as an inline image, or null when it passes these checks. */
export function inlineImageProblem(file: { size: number; type: string }): string | null {
    const type = file.type.toLowerCase();
    if (!(INLINE_IMAGE_TYPES as readonly string[]).includes(type)) {
        return `Only ${INLINE_IMAGE_RULES}`;
    }
    if (file.size === 0) return 'This file is empty.';
    if (file.size > INLINE_IMAGE_MAX_BYTES) {
        return `This image is ${Math.ceil(file.size / 1024)} KB. An inline image is at most 64 KB; store a larger one in Files and use a file field.`;
    }
    return null;
}

/**
 * Whether a URL is a data URI an inline image may carry. Only these reach an `<img>` here, which is
 * the rule delivery applies too: anything else stored in the field is not drawn.
 */
export function isInlineDataUri(url: unknown): url is string {
    return (
        typeof url === 'string' &&
        INLINE_IMAGE_TYPES.some((type) => url.startsWith(`data:${type};base64,`))
    );
}

/** The field's value as an inline image, or null for anything else. */
export function readInlineImage(value: unknown): InlineImage | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const { url, alt } = value as Record<string, unknown>;
    if (typeof url !== 'string') return null;
    return { url, alt: typeof alt === 'string' ? alt : null };
}

/** Reads a file into a base64 data URI, the form the field stores. */
export function toDataUri(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
        reader.readAsDataURL(file);
    });
}
