'use client';

import { useState } from 'react';
import { getApiUrl } from '@/lib/api';
import { formatBytes, publicFileLink } from '@/lib/files';
import { viewerVariantSource } from '@/lib/image-variants';
import { useFileBlob } from '@/hooks/use-files';
import { SourceImage } from '@/components/patterns/source-image';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

/** What the viewer needs of a file. A subset of `StoredFile`, so a picker row fits it too. */
export interface ViewableFile {
    id: string;
    fileName: string;
    contentType: string;
    size: number;
    isPublic: boolean;
    publicUrl?: string | null;
    alt?: string | null;
}

const IMAGE = 'mx-auto max-h-[70svh] w-auto max-w-full rounded-md object-contain';

/** Whether the viewer has anything to draw for this file. */
export function isViewableImage(contentType: string): boolean {
    return contentType.toLowerCase().startsWith('image/');
}

type Loaded = { width: number; height: number };

function screenSource(file: ViewableFile) {
    const screenWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const density = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    return viewerVariantSource(file, getApiUrl(), { screenWidth, density });
}

/**
 * A private file's bytes, fetched through the API client so the bearer rides in a header.
 *
 * The same reason the thumbnail does it: an `<img>` cannot send a token, and a token in the query
 * string would land in history, server logs and the next Referer.
 */
function PrivateImage({
    file,
    src,
    onLoaded,
}: {
    file: ViewableFile;
    src: string;
    onLoaded: (loaded: Loaded) => void;
}) {
    const { data: blob, isError } = useFileBlob(src);

    if (isError) return <p className="text-destructive py-8 text-center text-sm">This image could not be loaded.</p>;
    if (!blob) return <div className="bg-muted h-64 animate-pulse rounded-md" aria-hidden="true" />;
    return <SourceImage source={blob} alt={file.alt ?? ''} className={IMAGE} onLoaded={onLoaded} />;
}

function ViewerBody({ file }: { file: ViewableFile }) {
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const { src, authenticated } = screenSource(file);
    const link = publicFileLink(file, getApiUrl());

    // The pixel size of what is on screen, which for a resized copy is not the original's. The API
    // reports no dimensions for a stored file, so there is nothing truer to show until
    // BaryoDev/barakoCMS#668 records them.
    const shown = loaded ? `${loaded.width} x ${loaded.height}` : null;

    return (
        <>
            <DialogHeader>
                <DialogTitle className="truncate pr-8">{file.fileName}</DialogTitle>
                <DialogDescription>
                    {file.contentType}, {formatBytes(file.size)}
                    {shown ? `, shown at ${shown}` : ''}
                </DialogDescription>
            </DialogHeader>

            {authenticated ? (
                <PrivateImage file={file} src={src} onLoaded={setLoaded} />
            ) : (
                <SourceImage source={src} alt={file.alt ?? ''} className={IMAGE} onLoaded={setLoaded} />
            )}

            {link && (
                <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground truncate font-mono text-[11.5px] underline underline-offset-4"
                >
                    {link}
                </a>
            )}
        </>
    );
}

/**
 * An uploaded image at screen size, from the API's resized copy rather than the original.
 *
 * Escape and the close button both close it, which is Radix's dialog behaviour, and the body is
 * mounted only while a file is open so each file starts with its own state.
 */
export function ImageViewer({ file, onClose }: { file: ViewableFile | null; onClose: () => void }) {
    return (
        <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-3xl">
                {file && <ViewerBody key={file.id} file={file} />}
            </DialogContent>
        </Dialog>
    );
}
