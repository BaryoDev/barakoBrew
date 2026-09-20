'use client';

import { useEffect, useRef } from 'react';

type Loaded = { width: number; height: number };

interface ImageProps {
    alt: string;
    className?: string;
    onLoaded?: (size: Loaded) => void;
}

/**
 * Reports the pixel size of whatever the element ends up drawing.
 *
 * A listener on the element rather than an `onLoad` prop, because an `<img>` is not an interactive
 * element and the a11y rules refuse a handler on one. An image already in cache can be complete
 * before the effect runs and fires no second load, so that case is read directly.
 */
function useLoadedSize(
    image: React.RefObject<HTMLImageElement | null>,
    key: unknown,
    onLoaded?: (size: Loaded) => void,
) {
    useEffect(() => {
        const element = image.current;
        if (!element || !onLoaded) return;
        const report = () => onLoaded({ width: element.naturalWidth, height: element.naturalHeight });

        element.addEventListener('load', report);
        if (element.complete && element.naturalWidth > 0) report();
        return () => element.removeEventListener('load', report);
    }, [image, key, onLoaded]);
}

/** An image at a URL the console built. */
export function UrlImage({ src, alt, className, onLoaded }: ImageProps & { src: string }) {
    const image = useRef<HTMLImageElement>(null);
    useLoadedSize(image, src, onLoaded);

    // eslint-disable-next-line @next/next/no-img-element -- the optimiser is off on purpose (#80).
    return <img ref={image} src={src} alt={alt} className={className} />;
}

/**
 * Bytes the browser already holds, drawn from an object URL.
 *
 * The URL is made and released by the effect rather than held in state, so it goes with the element
 * and there is no way to forget it. An object URL pins its blob in memory until it is revoked.
 *
 * CodeQL reports js/xss-through-dom here, because it counts a File taken from an upload input as
 * DOM text and follows it through createObjectURL into src. It is a false positive on this element.
 * createObjectURL returns a blob: URL the browser mints, so nothing is parsed as markup, and an
 * <img> renders images in secure static mode, where scripts and external references are disabled
 * even for SVG. The upload path refuses SVG before a preview is drawn as well. Moving the write to
 * a JSX src prop, and splitting the URL case from the bytes case, were both tried and the query
 * follows the value either way, so there is no shape that clears it. Read this again if the element
 * ever stops being an <img>: a blob URL on an iframe, object or location is a different question.
 */
export function BlobImage({ blob, alt, className, onLoaded }: ImageProps & { blob: Blob }) {
    const image = useRef<HTMLImageElement>(null);
    useLoadedSize(image, blob, onLoaded);

    useEffect(() => {
        const element = image.current;
        if (!element) return;
        const url = URL.createObjectURL(blob);
        element.src = url;
        return () => URL.revokeObjectURL(url);
    }, [blob]);

    // eslint-disable-next-line @next/next/no-img-element -- the optimiser is off on purpose (#80).
    return <img ref={image} alt={alt} className={className} />;
}
