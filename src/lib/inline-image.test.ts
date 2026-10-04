import { describe, it, expect } from 'vitest';
import { INLINE_IMAGE_MAX_BYTES, inlineImageProblem, isInlineDataUri, readInlineImage } from './inline-image';

describe('the checks on an inline image before it is read', () => {
    it('accepts a small PNG, JPEG, GIF and WebP', () => {
        for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
            expect(inlineImageProblem({ size: 1000, type }), type).toBeNull();
        }
    });

    it('refuses SVG, which can carry script', () => {
        expect(inlineImageProblem({ size: 1000, type: 'image/svg+xml' })).toMatch(/SVG is not accepted/);
    });

    it('refuses an image over 64 KB, and takes one of exactly 64 KB', () => {
        expect(inlineImageProblem({ size: INLINE_IMAGE_MAX_BYTES, type: 'image/png' })).toBeNull();
        expect(inlineImageProblem({ size: INLINE_IMAGE_MAX_BYTES + 1, type: 'image/png' })).toMatch(/at most 64 KB/);
    });
});

describe('what an inline image field holds', () => {
    it('draws only a data URI of an allowed image type', () => {
        expect(isInlineDataUri('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
        expect(isInlineDataUri('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
        expect(isInlineDataUri('javascript:alert(1)')).toBe(false);
        expect(isInlineDataUri('https://example.com/a.png')).toBe(false);
    });

    it('reads the url and alt from the stored object, and nothing from anything else', () => {
        expect(readInlineImage({ url: 'data:image/png;base64,AA==', alt: 'Logo' })).toEqual({
            url: 'data:image/png;base64,AA==',
            alt: 'Logo',
        });
        expect(readInlineImage('data:image/png;base64,AA==')).toBeNull();
        expect(readInlineImage(null)).toBeNull();
    });
});
