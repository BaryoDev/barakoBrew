'use client';

import { useId, useState, type ReactNode } from 'react';
import { FieldError } from '@/components/content/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    INLINE_IMAGE_MAX_ALT,
    INLINE_IMAGE_MAX_BYTES,
    INLINE_IMAGE_NOTE,
    INLINE_IMAGE_TYPES,
    dataUriBytes,
    formatKb,
    inlineImageRules,
    inlineImageProblem,
    isInlineDataUri,
    readInlineImage,
    toDataUri,
} from '@/lib/inline-image';
import type { FieldDefinition } from '@/types/schema';

/**
 * An `inlineimage` field: a small image kept in the entry as a data URI, with its alt text.
 *
 * The type and the 64 KB limit are checked here, before anything is read, so an editor hears about
 * them at once. The API checks again, along with the pixel size and the image's own bytes, and its
 * refusal is shown on save.
 */
export function InlineImageField({
    field,
    label,
    value,
    error,
    onChange,
    maxBytes = INLINE_IMAGE_MAX_BYTES,
}: {
    field: FieldDefinition;
    label: ReactNode;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
    /** The limit on the decoded image. The API fixes it at 64 KB today, so that is the default. */
    maxBytes?: number;
}) {
    const [problem, setProblem] = useState<string | null>(null);
    const altId = useId();
    const image = readInlineImage(value);
    const drawable = image && isInlineDataUri(image.url) ? image.url : null;

    const choose = async (file: File | undefined) => {
        if (!file) return;
        const refused = inlineImageProblem(file, maxBytes);
        setProblem(refused);
        if (refused) return;
        try {
            const url = await toDataUri(file);
            onChange({ url, alt: image?.alt ?? null });
        } catch {
            setProblem('The file could not be read.');
        }
    };

    return (
        <div className="space-y-2">
            {label}
            <div className="flex items-start gap-3">
                {drawable ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a data URI, nothing to optimise.
                    <img
                        src={drawable}
                        alt={image?.alt ?? ''}
                        className="bg-muted size-16 shrink-0 rounded-md border object-contain"
                    />
                ) : (
                    <span className="bg-muted size-16 shrink-0 rounded-md border" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                    <Input
                        id={field.name}
                        type="file"
                        accept={INLINE_IMAGE_TYPES.join(',')}
                        aria-describedby={`${field.name}-inline-rules`}
                        onChange={(e) => {
                            void choose(e.target.files?.[0]);
                            // Cleared so picking the same file again after a refusal reads it again.
                            e.target.value = '';
                        }}
                    />
                    <p id={`${field.name}-inline-rules`} className="text-muted-foreground text-xs">
                        {inlineImageRules(maxBytes)}
                    </p>
                    {image && <SizeMeter bytes={dataUriBytes(image.url)} maxBytes={maxBytes} />}
                    <p data-testid="inline-image-note" className="text-muted-foreground text-xs">
                        {INLINE_IMAGE_NOTE}
                    </p>
                    {image && (
                        <div className="space-y-1">
                            <Label htmlFor={altId}>Alt text</Label>
                            <Input
                                id={altId}
                                value={image.alt ?? ''}
                                maxLength={INLINE_IMAGE_MAX_ALT}
                                onChange={(e) => onChange({ url: image.url, alt: e.target.value || null })}
                            />
                        </div>
                    )}
                </div>
                {image && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setProblem(null);
                            onChange(null);
                        }}
                    >
                        Remove
                    </Button>
                )}
            </div>
            <FieldError message={problem ?? error} />
        </div>
    );
}

/** The decoded size against the limit. Mono, since it is a count (design-rules R4). */
function SizeMeter({ bytes, maxBytes }: { bytes: number; maxBytes: number }) {
    const over = bytes > maxBytes;
    const share = Math.min(100, Math.round((bytes / maxBytes) * 100));
    return (
        <div className="space-y-1">
            <div
                role="meter"
                aria-label="Inline image size"
                aria-valuemin={0}
                aria-valuemax={maxBytes}
                aria-valuenow={Math.min(bytes, maxBytes)}
                aria-valuetext={`${formatKb(bytes)} of ${formatKb(maxBytes)}`}
                className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
            >
                <div
                    className={over ? 'bg-destructive h-full' : 'bg-primary h-full'}
                    style={{ width: `${share}%` }}
                />
            </div>
            <p data-testid="inline-image-size" className="text-muted-foreground font-mono text-xs tabular-nums">
                {formatKb(bytes)} of {formatKb(maxBytes)}
            </p>
        </div>
    );
}
