'use client';

import { useState } from 'react';
import { FILES_PAGE_SIZE, isForbidden, useFiles } from '@/hooks/use-files';
import { getApiUrl, isNotFound } from '@/lib/api';
import { publicFileLink } from '@/lib/files';
import { isAbsoluteHttpUrl } from '@/lib/site-settings';
import { FileThumbnail } from '@/components/patterns/file-thumbnail';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { TextField } from '@/components/site/editors';

/** A `url` field for an image: typed, or chosen from the public images in Files. */
export function ImageUrlField({
    id,
    label,
    value,
    onChange,
}: {
    id: string;
    label: string;
    value: unknown;
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const url = typeof value === 'string' ? value : '';
    const readable = url.trim() !== '' && isAbsoluteHttpUrl(url);

    return (
        <div className="flex items-end gap-3">
            {readable ? (
                // eslint-disable-next-line @next/next/no-img-element -- the optimiser is off on purpose (#80).
                <img src={url} alt="" className="bg-muted size-14 shrink-0 rounded-md border object-contain" />
            ) : (
                <span className="bg-muted size-14 shrink-0 rounded-md border" aria-hidden="true" />
            )}
            <div className="flex-1">
                <TextField
                    id={id}
                    label={label}
                    type="url"
                    value={url}
                    placeholder="https://"
                    onChange={onChange}
                    problem={url.trim() !== '' && !readable ? 'Use a full http or https address.' : null}
                />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
                Choose from Files
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Choose {label.toLowerCase()}</DialogTitle>
                        <DialogDescription>
                            Only public images are listed, since a visitor&apos;s browser cannot load a private file.
                        </DialogDescription>
                    </DialogHeader>
                    {open && (
                        <FilePicker
                            onPick={(picked) => {
                                onChange(picked);
                                setOpen(false);
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function FilePicker({ onPick }: { onPick: (url: string) => void }) {
    const [page, setPage] = useState(1);
    const { data, isLoading, isError, error } = useFiles(page);

    if (isLoading) return <TableSkeleton rows={3} />;
    if (isError || !data) {
        return (
            <p className="text-muted-foreground text-sm" role="alert">
                {isForbidden(error)
                    ? 'Your role cannot list files. Paste an address instead.'
                    : isNotFound(error)
                      ? 'Files is not enabled on this API. Paste an address instead.'
                      : 'Files could not be loaded. Paste an address instead.'}
            </p>
        );
    }

    const images = data.items.filter((f) => f.isPublic && f.contentType.toLowerCase().startsWith('image/'));
    const apiUrl = getApiUrl();

    return (
        <div className="space-y-3">
            {images.length === 0 ? (
                <p className="text-muted-foreground text-sm">No public images on this page of Files.</p>
            ) : (
                <ul className="max-h-80 space-y-1 overflow-y-auto">
                    {images.map((file) => {
                        const link = publicFileLink(file, apiUrl);
                        return (
                            <li key={file.id}>
                                <button
                                    type="button"
                                    disabled={!link}
                                    onClick={() => link && onPick(link)}
                                    className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-md p-2 text-left text-sm outline-none focus-visible:ring-2"
                                >
                                    <FileThumbnail file={file} size={40} />
                                    <span className="truncate">{file.alt || file.fileName}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {data.totalItems > FILES_PAGE_SIZE && (
                <div className="flex items-center justify-between">
                    <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                        Previous
                    </Button>
                    <span className="text-muted-foreground text-xs">
                        Page {page} of {Math.max(1, Math.ceil(data.totalItems / FILES_PAGE_SIZE))}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={page * FILES_PAGE_SIZE >= data.totalItems}
                        onClick={() => setPage(page + 1)}
                    >
                        Next
                    </Button>
                </div>
            )}
        </div>
    );
}
