'use client';

import { useId, useState, type ReactNode } from 'react';
import { JsonField } from '@/components/content/dynamic-form';
import { FieldError } from '@/components/content/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconArrowLeft, IconArrowRight, IconPlus, IconTrash } from '@/components/icons';
import { isValidHref, type SiteLink } from '@/lib/site-settings';
import { toLongHex } from '@/lib/contrast';

export const HREF_HINT = 'Use a path such as /donate, or a full http or https address. The site drops any other link.';

/** A titled block of the form. */
export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <section className="space-y-4 rounded-xl border p-5">
            <div>
                <h2 className="text-base font-semibold">{title}</h2>
                {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
            </div>
            {children}
        </section>
    );
}

export function TextField({
    id,
    label,
    value,
    onChange,
    placeholder,
    hint,
    problem,
    type = 'text',
}: {
    id: string;
    label: string;
    value: unknown;
    onChange: (value: string) => void;
    placeholder?: string;
    hint?: string;
    problem?: string | null;
    type?: string;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type={type}
                value={typeof value === 'string' ? value : ''}
                placeholder={placeholder}
                aria-invalid={problem ? true : undefined}
                aria-describedby={hint || problem ? `${id}-hint` : undefined}
                onChange={(e) => onChange(e.target.value)}
            />
            {problem ? (
                <p id={`${id}-hint`} className="text-warning text-xs">
                    {problem}
                </p>
            ) : (
                hint && (
                    <p id={`${id}-hint`} className="text-muted-foreground text-xs">
                        {hint}
                    </p>
                )
            )}
        </div>
    );
}

/**
 * A JSON field edited through `editor` when `read` understands the stored value, and as validated
 * JSON when it does not. The switch to JSON stays one click away for anything the editor leaves out.
 */
export function Structured<T>({
    field,
    label,
    value,
    read,
    onChange,
    children,
}: {
    field: string;
    label: string;
    value: unknown;
    read: (value: unknown) => T | null;
    onChange: (value: unknown) => void;
    children: (parsed: T) => ReactNode;
}) {
    const parsed = read(value);
    const [asJson, setAsJson] = useState(false);
    const showJson = asJson || parsed === null;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-end">
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={parsed === null}
                    onClick={() => setAsJson(!showJson)}
                >
                    {showJson ? 'Edit with the form' : 'Edit as JSON'}
                </Button>
            </div>
            {parsed === null && (
                <p className="text-warning text-xs">
                    The stored {label.toLowerCase()} is not in the documented shape, so it is shown as JSON to keep all
                    of it.
                </p>
            )}
            {showJson ? (
                <JsonField
                    field={{ name: `json-${field}`, displayName: label, type: 'json', isRequired: false }}
                    type="json"
                    label={
                        <Label htmlFor={`json-${field}`} className="sr-only">
                            {label} as JSON
                        </Label>
                    }
                    value={value}
                    onChange={onChange}
                />
            ) : (
                children(parsed as T)
            )}
        </div>
    );
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

/** Rows of two text inputs, reorderable, for links and social profiles. */
export function PairList<T extends object>({
    items,
    onChange,
    columns,
    blank,
    noun,
    hrefKey,
}: {
    items: readonly T[];
    onChange: (items: T[]) => void;
    columns: readonly { key: keyof T & string; label: string; placeholder?: string }[];
    blank: T;
    noun: string;
    /** The column holding a link, which is checked against what the renderer keeps. */
    hrefKey?: keyof T & string;
}) {
    const base = useId();
    const update = (index: number, key: keyof T, value: string) =>
        onChange(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));

    return (
        <div className="space-y-2">
            {items.length === 0 && (
                <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
                    No {noun}s yet.
                </p>
            )}
            <ol className="space-y-2">
                {items.map((item, index) => {
                    const href = hrefKey ? String(item[hrefKey] ?? '') : '';
                    const badHref = hrefKey !== undefined && href.trim() !== '' && !isValidHref(href);
                    return (
                        <li key={index} className="rounded-lg border p-3">
                            <div className="flex flex-wrap items-end gap-2">
                                {columns.map((column) => {
                                    const id = `${base}-${index}-${column.key}`;
                                    return (
                                        <div key={column.key} className="min-w-40 flex-1 space-y-1">
                                            <Label htmlFor={id} className="text-xs">
                                                {column.label} {index + 1}
                                            </Label>
                                            <Input
                                                id={id}
                                                value={String(item[column.key] ?? '')}
                                                placeholder={column.placeholder}
                                                aria-invalid={column.key === hrefKey && badHref ? true : undefined}
                                                onChange={(e) => update(index, column.key, e.target.value)}
                                            />
                                        </div>
                                    );
                                })}
                                <div className="flex gap-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Move ${noun} ${index + 1} up`}
                                        disabled={index === 0}
                                        onClick={() => onChange(move(items, index, index - 1))}
                                    >
                                        <IconArrowLeft className="rotate-90" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Move ${noun} ${index + 1} down`}
                                        disabled={index === items.length - 1}
                                        onClick={() => onChange(move(items, index, index + 1))}
                                    >
                                        <IconArrowRight className="rotate-90" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Remove ${noun} ${index + 1}`}
                                        onClick={() => onChange(items.filter((_, i) => i !== index))}
                                    >
                                        <IconTrash />
                                    </Button>
                                </div>
                            </div>
                            {badHref && <FieldError message={HREF_HINT} />}
                        </li>
                    );
                })}
            </ol>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, { ...blank }])}>
                <IconPlus />
                Add {noun}
            </Button>
        </div>
    );
}

export function LinkList({ links, onChange }: { links: readonly SiteLink[]; onChange: (links: SiteLink[]) => void }) {
    return (
        <PairList
            items={links}
            onChange={onChange}
            noun="link"
            hrefKey="href"
            blank={{ label: '', href: '' }}
            columns={[
                { key: 'label', label: 'Label', placeholder: 'Donate' },
                { key: 'href', label: 'Link', placeholder: '/donate' },
            ]}
        />
    );
}

/** A hex colour as a native picker beside a text box, since a picker alone cannot be typed into. */
export function ColourInput({
    id,
    label,
    value,
    onChange,
    labelHidden = false,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    labelHidden?: boolean;
}) {
    const long = toLongHex(value);
    const unreadable = value !== '' && long === null;
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    aria-label={`${label} picker`}
                    value={long ?? '#000000'}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                />
                <Label htmlFor={id} className={labelHidden ? 'sr-only' : 'w-44 shrink-0 font-mono text-xs'}>
                    {label}
                </Label>
                <Input
                    id={id}
                    value={value}
                    placeholder="Not set"
                    spellCheck={false}
                    aria-invalid={unreadable ? true : undefined}
                    className="font-mono text-xs"
                    onChange={(e) => onChange(e.target.value.trim())}
                />
            </div>
            {unreadable && <FieldError message="Not a hex colour. Use #rgb or #rrggbb." />}
        </div>
    );
}
