'use client';

import { useId, useState, type ReactNode } from 'react';
import { FieldError } from '@/components/content/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    INLINE_IMAGE_MAX_ALT,
    INLINE_IMAGE_RULES,
    INLINE_IMAGE_TYPES,
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
}: {
    field: FieldDefinition;
    label: ReactNode;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
}) {
    const [problem, setProblem] = useState<string | null>(null);
    const altId = useId();
    const image = readInlineImage(value);
    const drawable = image && isInlineDataUri(image.url) ? image.url : null;

    const choose = async (file: File | undefined) => {
        if (!file) return;
        const refused = inlineImageProblem(file);
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
                        {INLINE_IMAGE_RULES} The image is saved in every version of the entry, so keep it
                        small.
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
