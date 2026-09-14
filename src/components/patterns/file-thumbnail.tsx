'use client';

import { useEffect, useRef } from 'react';
import { getApiUrl } from '@/lib/api';
import { imageVariantSrcSet, isResizableImage, type ImageFile } from '@/lib/image-variants';
import { useFileBlob } from '@/hooks/use-files';
import { IconArchive } from '@/components/icons';
import { cn } from '@/lib/utils';

const BOX = 'bg-muted inline-block shrink-0 rounded-md border object-cover';

/**
 * A private file's variant, shown from an object URL. The route needs a bearer token and an `<img>`
 * cannot send one; putting the token in the query string instead would leave it in history, server
 * logs and the Referer of whatever the page loads next.
 *
 * The object URL is made and revoked by the effect rather than held in state, so it is released with
 * the element and a remount makes a fresh one from the cached blob.
 */
function PrivateThumbnail({ src, size }: { src: string; size: number }) {
    const { data: blob } = useFileBlob(src);
    const img = useRef<HTMLImageElement>(null);

    useEffect(() => {
        if (!blob || !img.current) return;
        const objectUrl = URL.createObjectURL(blob);
        img.current.src = objectUrl;
        return () => URL.revokeObjectURL(objectUrl);
    }, [blob]);

    if (!blob) return <span className={BOX} style={{ width: size, height: size }} aria-hidden="true" />;
    // eslint-disable-next-line @next/next/no-img-element -- the optimiser is off on purpose (#80).
    return <img ref={img} alt="" className={BOX} style={{ width: size, height: size }} />;
}

/**
 * A square preview of an uploaded file, drawn `size` CSS pixels wide from the API's resized copy.
 *
 * Decorative: it sits next to the file name, so its alt text is empty. A file the API does not resize
 * (PDF, GIF, AVIF) shows an icon rather than downloading a full size original for a thumbnail.
 */
export function FileThumbnail({ file, size }: { file: ImageFile; size: number }) {
    if (!isResizableImage(file.contentType)) {
        return (
            <span
                className={cn(BOX, 'text-muted-foreground grid place-items-center')}
                style={{ width: size, height: size }}
                aria-hidden="true"
            >
                <IconArchive className="size-4" />
            </span>
        );
    }

    if (!file.isPublic) {
        const density = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
        const { src } = imageVariantSrcSet(file, getApiUrl(), { width: size, density });
        return <PrivateThumbnail src={src} size={size} />;
    }

    const { src, srcSet, sizes } = imageVariantSrcSet(file, getApiUrl(), { width: size });
    return (
        // eslint-disable-next-line @next/next/no-img-element -- the optimiser is off on purpose (#80).
        <img
            src={src}
            srcSet={srcSet}
            sizes={sizes}
            alt=""
            loading="lazy"
            decoding="async"
            className={BOX}
            style={{ width: size, height: size }}
        />
    );
}
