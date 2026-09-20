'use client';

import { useEffect, useRef } from 'react';

/**
 * An image drawn from a URL or from bytes the browser already holds.
 *
 * Bytes get an object URL, which pins the blob in memory until it is revoked, so the URL is made
 * and released by the effect: it goes when the element goes or the source changes, with no way to
 * forget it. `src` is set on the element rather than rendered, for the same reason.
 */
export function SourceImage({
    source,
    alt,
    className,
    onLoaded,
}: {
    source: string | Blob;
    alt: string;
    className?: string;
    onLoaded?: (size: { width: number; height: number }) => void;
}) {
    const image = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const element = image.current;
        if (!element) return;
        const url = typeof source === 'string' ? source : URL.createObjectURL(source);
        const report = () => onLoaded?.({ width: element.naturalWidth, height: element.naturalHeight });

        element.addEventListener('load', report);
        element.src = url;
        if (element.complete && element.naturalWidth > 0) report();

        return () => {
            element.removeEventListener('load', report);
            if (typeof source !== 'string') URL.revokeObjectURL(url);
        };
    }, [source, onLoaded]);

    // eslint-disable-next-line @next/next/no-img-element -- the optimiser is off on purpose (#80).
    return <img ref={image} alt={alt} className={className} />;
}
