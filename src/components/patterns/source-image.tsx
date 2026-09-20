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

function UrlImage({ src, alt, className, onLoaded }: ImageProps & { src: string }) {
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
 */
function BlobImage({ blob, alt, className, onLoaded }: ImageProps & { blob: Blob }) {
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

/** An image drawn from a URL or from bytes the browser already holds. */
export function SourceImage({ source, ...rest }: ImageProps & { source: string | Blob }) {
    return typeof source === 'string' ? (
        <UrlImage src={source} {...rest} />
    ) : (
        <BlobImage blob={source} {...rest} />
    );
}
