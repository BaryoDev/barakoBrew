import { describe, it, expect } from 'vitest';
import {
    VARIANT_LADDER,
    imageVariantSrcSet,
    isResizableImage,
    snapToLadder,
    viewerVariantSource,
} from './image-variants';

const API = 'https://cms.example.test/';

const photo = (overrides: Partial<{ id: string; contentType: string; isPublic: boolean }> = {}) => ({
    id: 'abc',
    contentType: 'image/jpeg',
    isPublic: true,
    ...overrides,
});

describe('snapToLadder', () => {
    it('is the ladder the API documents', () => {
        expect(VARIANT_LADDER).toEqual([160, 320, 640, 960, 1280, 1920]);
    });

    it('snaps up to the next rung, the way the API answers', () => {
        expect(snapToLadder(1)).toBe(160);
        expect(snapToLadder(128)).toBe(160);
        expect(snapToLadder(160)).toBe(160);
        expect(snapToLadder(161)).toBe(320);
        expect(snapToLadder(400)).toBe(640);
        expect(snapToLadder(700)).toBe(960);
    });

    it('stays on the top rung above it, never asking for a width the cap could refuse', () => {
        expect(snapToLadder(1921)).toBe(1920);
        expect(snapToLadder(5000)).toBe(1920);
    });
});

describe('imageVariantSrcSet', () => {
    it('gives a public image the anonymous route with a srcset of the rungs up to 3x', () => {
        const source = imageVariantSrcSet(photo(), API, { width: 200 });

        expect(source.authenticated).toBe(false);
        expect(source.src).toBe('https://cms.example.test/api/public/files/abc?w=320');
        expect(source.srcSet).toBe(
            [
                'https://cms.example.test/api/public/files/abc?w=320 320w',
                'https://cms.example.test/api/public/files/abc?w=640 640w',
            ].join(', '),
        );
        expect(source.sizes).toBe('200px');
    });

    it('requests the 160 rung for a 64px thumbnail even on a 2x screen', () => {
        const source = imageVariantSrcSet(photo(), API, { width: 64 });

        expect(source.src).toBe('https://cms.example.test/api/public/files/abc?w=160');
        expect(source.srcSet?.split(', ')).toEqual([
            'https://cms.example.test/api/public/files/abc?w=160 160w',
            'https://cms.example.test/api/public/files/abc?w=320 320w',
        ]);
    });

    it('gives a private image one authenticated URL sized for the density, and no srcset', () => {
        const source = imageVariantSrcSet(photo({ isPublic: false }), API, { width: 64, density: 3 });

        expect(source.authenticated).toBe(true);
        expect(source.src).toBe('https://cms.example.test/api/files/abc?w=320');
        expect(source.srcSet).toBeUndefined();
        expect(source.sizes).toBeUndefined();
    });

    it('snaps a private image at 2x onto the rung that covers it', () => {
        expect(imageVariantSrcSet(photo({ isPublic: false }), API, { width: 64, density: 2 }).src).toBe(
            'https://cms.example.test/api/files/abc?w=160',
        );
    });

    it.each([
        ['application/pdf', true],
        ['image/avif', true],
        ['image/gif', false],
    ])('gives a %s file its original, with no ?w= and no srcset', (contentType, isPublic) => {
        const source = imageVariantSrcSet(photo({ contentType, isPublic }), API, { width: 64 });

        expect(source.src).not.toContain('?w=');
        expect(source.src).toMatch(/\/api\/(public\/)?files\/abc$/);
        expect(source.srcSet).toBeUndefined();
    });

    it('decides by the content type the metadata carries, ignoring case and parameters', () => {
        expect(isResizableImage('IMAGE/PNG')).toBe(true);
        expect(isResizableImage('image/webp; charset=binary')).toBe(true);
        expect(isResizableImage('image/avif')).toBe(false);
        expect(isResizableImage('application/pdf')).toBe(false);
    });
});

describe('viewerVariantSource', () => {
    it('asks for the rung that covers the screen, not the original', () => {
        const source = viewerVariantSource(photo(), API, { screenWidth: 1200 });

        expect(source.src).toBe('https://cms.example.test/api/public/files/abc?w=1280');
        expect(source.srcSet).toBeUndefined();
        expect(source.authenticated).toBe(false);
    });

    it('covers a dense screen with the rung above the CSS width', () => {
        expect(viewerVariantSource(photo(), API, { screenWidth: 420, density: 2 }).src).toBe(
            'https://cms.example.test/api/public/files/abc?w=960',
        );
    });

    it('stays on the top rung on a screen wider than the ladder', () => {
        expect(viewerVariantSource(photo(), API, { screenWidth: 2560, density: 2 }).src).toBe(
            'https://cms.example.test/api/public/files/abc?w=1920',
        );
    });

    it('sends a private image to the authenticated route, at the same rung', () => {
        const source = viewerVariantSource(photo({ isPublic: false }), API, { screenWidth: 1200 });

        expect(source.src).toBe('https://cms.example.test/api/files/abc?w=1280');
        expect(source.authenticated).toBe(true);
    });

    it('gives an AVIF its original, since the API does not resize one', () => {
        const source = viewerVariantSource(photo({ contentType: 'image/avif' }), API, { screenWidth: 1200 });

        expect(source.src).toBe('https://cms.example.test/api/public/files/abc');
    });
});
