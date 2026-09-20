'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FieldError } from '@/components/content/field-error';
import { renderMarkdown } from '@/lib/markdown';
import type { FieldDefinition } from '@/types/schema';

type Mark = { name: string } & ({ wrap: [string, string] } | { prefix: string });

const MARKS: Mark[] = [
    { name: 'Bold', wrap: ['**', '**'] },
    { name: 'Italic', wrap: ['_', '_'] },
    { name: 'Heading', prefix: '## ' },
    { name: 'Link', wrap: ['[', '](https://)'] },
    { name: 'List', prefix: '- ' },
    { name: 'Quote', prefix: '> ' },
    { name: 'Code', wrap: ['`', '`'] },
];

export function applyMark(value: string, start: number, end: number, mark: Mark) {
    if ('wrap' in mark) {
        const [open, close] = mark.wrap;
        const next = value.slice(0, start) + open + value.slice(start, end) + close + value.slice(end);
        return { value: next, start: start + open.length, end: end + open.length };
    }
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const next = value.slice(0, lineStart) + mark.prefix + value.slice(lineStart);
    return { value: next, start: start + mark.prefix.length, end: end + mark.prefix.length };
}

export function countWords(value: string) {
    const trimmed = value.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
}

/*
 * Two changes to the site's output, both for the console and neither to what is sanitised.
 * Heading ids are dropped because the preview sits in a form whose controls are found by id, and a
 * heading called "Body" must not shadow the field called Body. Links open a new tab, because
 * following one in place would leave the form and lose whatever has not been saved.
 */
export function previewHtml(source: string) {
    return renderMarkdown(source)
        .replace(/<h([1-6]) id="[^"]*">/g, '<h$1>')
        .replace(/<a href=/g, '<a target="_blank" href=');
}

const PREVIEW_STYLES = [
    'min-h-40 rounded-md border px-4 py-3 text-sm leading-relaxed break-words',
    '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-bold',
    '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold',
    '[&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold',
    '[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold',
    '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6',
    '[&_a]:text-[var(--accent-ink)] [&_a]:underline',
    '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
    '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em]',
    // Wrapped rather than scrolled: a region that scrolls has to be reachable by keyboard.
    '[&_pre]:my-2 [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:whitespace-pre-wrap [&_pre_code]:bg-transparent [&_pre_code]:p-0',
    '[&_img]:max-w-full [&_hr]:my-4 [&_table]:my-2 [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2',
].join(' ');

export function MarkdownField({
    field,
    label,
    value,
    error,
    onChange,
}: {
    field: FieldDefinition;
    label: React.ReactNode;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
}) {
    const [mode, setMode] = useState('write');
    const textarea = useRef<HTMLTextAreaElement>(null);
    const text = typeof value === 'string' ? value : '';
    const words = countWords(text);

    const mark = (m: Mark) => {
        const el = textarea.current;
        if (!el) return;
        const next = applyMark(text, el.selectionStart, el.selectionEnd, m);
        onChange(next.value);
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(next.start, next.end);
        });
    };

    return (
        <div className="space-y-2">
            {label}
            <Tabs value={mode} onValueChange={setMode} className="gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <TabsList aria-label={`${field.displayName} editor mode`}>
                        <TabsTrigger value="write">Write</TabsTrigger>
                        <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                    <span className="text-muted-foreground font-mono text-xs">
                        {words} {words === 1 ? 'word' : 'words'}
                    </span>
                </div>
                <TabsContent value="write" forceMount className="space-y-2 data-[state=inactive]:hidden">
                    <div
                        role="toolbar"
                        aria-label={`${field.displayName} formatting`}
                        className="flex flex-wrap gap-1"
                    >
                        {MARKS.map((m) => (
                            <Button
                                key={m.name}
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-controls={field.name}
                                onClick={() => mark(m)}
                            >
                                {m.name}
                            </Button>
                        ))}
                    </div>
                    <Textarea
                        ref={textarea}
                        id={field.name}
                        rows={10}
                        value={text}
                        onChange={(e) => onChange(e.target.value)}
                        className="font-mono text-sm"
                    />
                </TabsContent>
                <TabsContent value="preview">
                    {text.trim() ? (
                        <div
                            className={PREVIEW_STYLES}
                            // Sanitised by renderMarkdown: raw HTML escaped, destinations allowlisted.
                            dangerouslySetInnerHTML={{ __html: previewHtml(text) }}
                        />
                    ) : (
                        <p className="text-muted-foreground min-h-40 rounded-md border px-4 py-3 text-sm">
                            Nothing to preview yet.
                        </p>
                    )}
                </TabsContent>
            </Tabs>
            <FieldError message={error} />
        </div>
    );
}
