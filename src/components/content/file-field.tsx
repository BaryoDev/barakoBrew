'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FILES_PAGE_SIZE, isForbidden, uploadFile, useFiles, type StoredFile } from '@/hooks/use-files';
import { api, apiErrorMessage, isNotFound } from '@/lib/api';
import { contentProblem, formatBytes, UPLOAD_RULES, uploadProblem } from '@/lib/files';
import { FileThumbnail } from '@/components/patterns/file-thumbnail';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { FieldError } from '@/components/content/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
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

/** The alt text cap PATCH /api/files/{id} enforces (MaxAlt in BarakoCMS.Files). */
const MAX_ALT = 500;

const IMAGE_UPLOAD_TYPES = 'image/png,image/jpeg,image/gif,image/webp,image/avif';
const ANY_UPLOAD_TYPES = `${IMAGE_UPLOAD_TYPES},application/pdf`;

function isImage(contentType: string) {
    return contentType.toLowerCase().startsWith('image/');
}

/** Alt text is kept on the file, not in the entry, so every entry using the image reads the same words. */
async function saveAlt(id: string, alt: string) {
    await api.patch(`/api/files/${id}`, { alt });
}

/**
 * A `file` field: the id of a stored file, picked from Files rather than pasted.
 *
 * The entry keeps the id. What the field shows comes from the `files` member of the entry read, which
 * resolves only files this caller may download, or from the row just picked. With the `image` editor
 * hint the picker lists images only. A new file can be uploaded from here too, and an image is not
 * uploaded without alt text.
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
    const [uploading, setUploading] = useState(false);
    const [picked, setPicked] = useState<ShownFile | null>(null);
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
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-haspopup="dialog"
                    aria-label={`Upload ${imagesOnly ? 'an image' : 'a file'} for ${field.displayName}`}
                    onClick={() => setUploading(true)}
                >
                    Upload
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
            {shown && isImage(shown.contentType) && !shown.alt && (
                <MissingAlt
                    fileId={shown.id}
                    fieldName={field.displayName}
                    onSaved={(alt) => setPicked({ ...shown, alt })}
                />
            )}
            <FieldError message={error} />

            {uploading && (
                <UploadDialog
                    fieldName={field.displayName}
                    imagesOnly={imagesOnly}
                    onClose={() => setUploading(false)}
                    onUploaded={(file) => {
                        setPicked(file);
                        onChange(file.id);
                        setUploading(false);
                    }}
                />
            )}

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
                            From Files. To add a new one, close this and choose Upload.
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

/** An image already in the field with no alt text. The words are saved on the file. */
function MissingAlt({
    fileId,
    fieldName,
    onSaved,
}: {
    fileId: string;
    fieldName: string;
    onSaved: (alt: string) => void;
}) {
    const altId = useId();
    const [alt, setAlt] = useState('');
    const [problem, setProblem] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        setProblem(null);
        try {
            await saveAlt(fileId, alt.trim());
            onSaved(alt.trim());
        } catch (err) {
            setProblem(apiErrorMessage(err, 'The alt text could not be saved.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-1.5">
            <Label htmlFor={altId}>Alt text for {fieldName}</Label>
            <div className="flex items-center gap-2">
                <Input
                    id={altId}
                    value={alt}
                    required
                    aria-invalid={!alt.trim()}
                    aria-describedby={`${altId}-hint`}
                    maxLength={MAX_ALT}
                    onChange={(e) => setAlt(e.target.value)}
                />
                <Button type="button" variant="outline" size="sm" disabled={!alt.trim() || saving} onClick={save}>
                    {saving ? 'Saving…' : 'Save alt text'}
                </Button>
            </div>
            <p id={`${altId}-hint`} className="text-muted-foreground text-xs">
                This image has no alt text. Describe it for someone who cannot see it; it is saved on the file.
            </p>
            <FieldError message={problem ?? undefined} />
        </div>
    );
}

function UploadDialog({
    fieldName,
    imagesOnly,
    onClose,
    onUploaded,
}: {
    fieldName: string;
    imagesOnly: boolean;
    onClose: () => void;
    onUploaded: (file: ShownFile) => void;
}) {
    const queryClient = useQueryClient();
    const [file, setFile] = useState<File | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [alt, setAlt] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const [sending, setSending] = useState(false);
    const needsAlt = file !== null && isImage(file.type);

    const choose = async (chosen: File | undefined) => {
        setFile(null);
        if (!chosen) return setProblem(null);
        const refused =
            imagesOnly && !isImage(chosen.type)
                ? 'Only an image can go in this field.'
                : (uploadProblem(chosen) ?? (await contentProblem(chosen).catch(() => 'The file could not be read.')));
        setProblem(refused);
        if (!refused) setFile(chosen);
    };

    const upload = async () => {
        if (!file) return;
        setSending(true);
        setProblem(null);
        try {
            const uploaded = await uploadFile(file, isPublic);
            const words = alt.trim();
            if (words) await saveAlt(uploaded.id, words);
            queryClient.invalidateQueries({ queryKey: ['files'] });
            onUploaded({ ...uploaded, alt: words || null });
        } catch (err) {
            setProblem(apiErrorMessage(err, 'The file could not be uploaded.'));
            setSending(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Upload {imagesOnly ? 'an image' : 'a file'} for {fieldName}</DialogTitle>
                    <DialogDescription>{UPLOAD_RULES}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="field-upload-input">Choose a file</Label>
                        <Input
                            id="field-upload-input"
                            type="file"
                            accept={imagesOnly ? IMAGE_UPLOAD_TYPES : ANY_UPLOAD_TYPES}
                            onChange={(e) => void choose(e.target.files?.[0])}
                        />
                        <FieldError message={problem ?? undefined} />
                    </div>
                    {needsAlt && (
                        <div className="space-y-1.5">
                            <Label htmlFor="field-upload-alt">Alt text</Label>
                            <Input
                                id="field-upload-alt"
                                value={alt}
                                required
                                aria-describedby="field-upload-alt-hint"
                                maxLength={MAX_ALT}
                                onChange={(e) => setAlt(e.target.value)}
                            />
                            <p id="field-upload-alt-hint" className="text-muted-foreground text-xs">
                                Required for an image. Describe it for someone who cannot see it.
                            </p>
                        </div>
                    )}
                    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                        <div className="space-y-0.5">
                            <Label htmlFor="field-upload-public">Public</Label>
                            <p id="field-upload-public-help" className="text-muted-foreground text-xs">
                                Anyone with the link can open a public file. This cannot be changed after upload.
                            </p>
                        </div>
                        <Switch
                            id="field-upload-public"
                            checked={isPublic}
                            onCheckedChange={setIsPublic}
                            aria-describedby="field-upload-public-help"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={!file || (needsAlt && !alt.trim()) || sending}
                        onClick={() => void upload()}
                    >
                        {sending ? 'Uploading…' : 'Upload'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
