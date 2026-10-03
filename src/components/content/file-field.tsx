'use client';

import { useRef, useState, type ReactNode } from 'react';
import { FILES_PAGE_SIZE, isForbidden, useFiles, type StoredFile } from '@/hooks/use-files';
import { isNotFound } from '@/lib/api';
import { formatBytes } from '@/lib/files';
import { FileThumbnail } from '@/components/patterns/file-thumbnail';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { FieldError } from '@/components/content/field-error';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { IconTimes } from '@/components/icons';
import type { ResolvedFile } from '@/types/content';
import type { FieldDefinition } from '@/types/schema';

/** What the field shows about the file it names, from a pick or from the entry read. */
interface ShownFile {
    id: string;
    fileName: string;
    contentType: string;
    size: number;
    isPublic: boolean;
    alt: string | null;
}

function fromResolved(file: ResolvedFile): ShownFile {
    // The read gives a private file no url, which is the only place it says the file is private.
    return { ...file, isPublic: file.url !== null };
}

/**
 * A `file` field: the id of a stored file, picked from Files rather than pasted.
 *
 * The entry keeps the id. What the field shows comes from the `files` member of the entry read, which
 * resolves only files this caller may download, or from the row just picked. With the `image` editor
 * hint the picker lists images only. Uploading stays on the Files screen.
 */
export function FileField({
    field,
    label,
    value,
    error,
    onChange,
    resolved,
    imagesOnly,
}: {
    field: FieldDefinition;
    label: ReactNode;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
    resolved?: ResolvedFile;
    imagesOnly: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [picked, setPicked] = useState<StoredFile | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const id = typeof value === 'string' ? value : '';
    const action = id ? 'Change' : imagesOnly ? 'Choose image' : 'Choose file';
    const shown: ShownFile | null =
        picked && picked.id === id ? picked : resolved && resolved.id.toLowerCase() === id.toLowerCase() ? fromResolved(resolved) : null;

    return (
        <div className="space-y-2">
            {label}
            <div className="flex items-center gap-3">
                {shown ? (
                    <FileThumbnail file={shown} size={48} />
                ) : (
                    <span className="bg-muted size-12 shrink-0 rounded-md border" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1 text-sm">
                    {shown ? (
                        <>
                            <p className="truncate font-medium">{shown.fileName}</p>
                            <p className="text-muted-foreground text-xs">
                                {shown.contentType} · {formatBytes(shown.size)}
                                {shown.isPublic ? '' : ' · private'}
                                {shown.alt ? ` · alt: ${shown.alt}` : ''}
                            </p>
                        </>
                    ) : id ? (
                        <>
                            <p className="font-mono text-xs">{id}</p>
                            <p className="text-muted-foreground text-xs">
                                This file is not one you can download, or it was deleted. Saving keeps it.
                            </p>
                        </>
                    ) : (
                        <p className="text-muted-foreground">No file chosen.</p>
                    )}
                </div>
                <Button
                    ref={triggerRef}
                    id={field.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-haspopup="dialog"
                    // Named for what it does as well as the field: the field label points at this
                    // button, and without this its name would be only the field's.
                    aria-label={`${action} for ${field.displayName}`}
                    onClick={() => setOpen(true)}
                >
                    {action}
                </Button>
                {id && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Clear ${field.displayName}`}
                        onClick={() => {
                            setPicked(null);
                            onChange(null);
                        }}
                    >
                        <IconTimes className="size-3.5" />
                    </Button>
                )}
            </div>
            <FieldError message={error} />

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="max-w-lg"
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        triggerRef.current?.focus();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Choose {imagesOnly ? 'an image' : 'a file'} for {field.displayName}</DialogTitle>
                        <DialogDescription>
                            From Files. To add a new one, upload it on the Files screen first.
                        </DialogDescription>
                    </DialogHeader>
                    {open && (
                        <StoredFilePicker
                            imagesOnly={imagesOnly}
                            onPick={(file) => {
                                setPicked(file);
                                onChange(file.id);
                                setOpen(false);
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function StoredFilePicker({ imagesOnly, onPick }: { imagesOnly: boolean; onPick: (file: StoredFile) => void }) {
    const [page, setPage] = useState(1);
    const { data, isLoading, isError, error } = useFiles(page);

    if (isLoading) return <TableSkeleton rows={3} />;
    if (isError || !data) {
        return (
            <p className="text-muted-foreground text-sm" role="alert">
                {isForbidden(error)
                    ? 'Your role cannot list files.'
                    : isNotFound(error)
                      ? 'Files is not enabled on this API.'
                      : 'Files could not be loaded.'}
            </p>
        );
    }

    const files = imagesOnly
        ? data.items.filter((f) => f.contentType.toLowerCase().startsWith('image/'))
        : data.items;

    return (
        <div className="space-y-3">
            {files.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                    {imagesOnly ? 'No images on this page of Files.' : 'No files on this page of Files.'}
                </p>
            ) : (
                <ul className="max-h-80 space-y-1 overflow-y-auto">
                    {files.map((file) => (
                        <li key={file.id}>
                            <button
                                type="button"
                                onClick={() => onPick(file)}
                                className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-md p-2 text-left text-sm outline-none focus-visible:ring-2"
                            >
                                <FileThumbnail file={file} size={40} />
                                <span className="min-w-0 flex-1 truncate">{file.alt || file.fileName}</span>
                                <span className="text-muted-foreground text-xs">
                                    {file.isPublic ? 'Public' : 'Private'}
                                </span>
                            </button>
                        </li>
                    ))}
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
