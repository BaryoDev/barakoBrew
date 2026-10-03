'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { IconChevronDown, IconPlus, IconTimes } from '@/components/icons';
import { FieldError } from '@/components/content/field-error';
import { useContent, useContents } from '@/hooks/use-contents';
import { useSchemas } from '@/hooks/use-schemas';
import { useDebounced } from '@/hooks/use-debounced';
import { contentTitle } from '@/lib/content-title';
import { apiErrorMessage, isNotFound } from '@/lib/api';
import type { ContentListItem } from '@/types/content';
import type { FieldDefinition } from '@/types/schema';

/** The most ids a many-valued reference holds. The API refuses a longer list. */
export const MAX_REFERENCES = 100;

/**
 * The ids the field holds, in order. A stored single id, from before the field took a list, reads
 * as a list of one, so the next save writes the list the field now wants.
 */
export function referenceList(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
    if (typeof value === 'string' && value) return [value];
    return [];
}

/**
 * A `reference` field with `multiple`: several entries of the target type, in the order they were
 * picked, each shown by its title. The value is the list of ids, at most 100, each once.
 */
export function ReferenceListField({
    field,
    referenceType,
    label,
    value,
    error,
    onChange,
}: {
    field: FieldDefinition;
    referenceType: string;
    label: ReactNode;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    // Entries picked on this screen, so their titles show without a read each.
    const [known, setKnown] = useState<Record<string, ContentListItem>>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const query = useDebounced(search, 300);

    const ids = referenceList(value);
    const full = ids.length >= MAX_REFERENCES;

    const { data: schemas, isPending: typesLoading } = useSchemas();
    // Matched without regard to case, as the API matches it; the list filters on the exact spelling.
    const target = schemas?.find((s) => s.name.toLowerCase() === referenceType.toLowerCase());
    const queryType = target?.name ?? referenceType;
    const targetLabel = target?.displayName ?? referenceType;

    const {
        data: page,
        isLoading,
        isError: listFailed,
        error: listError,
        refetch: refetchList,
    } = useContents(
        { contentType: queryType, search: query || undefined, page: 1, pageSize: 20 },
        open && !typesLoading,
    );
    const entries = page?.items ?? [];

    const add = (entry: ContentListItem) => {
        if (ids.includes(entry.id) || full) return;
        setKnown((k) => ({ ...k, [entry.id]: entry }));
        onChange([...ids, entry.id]);
        setSearch('');
        setOpen(false);
    };

    const remove = (index: number) => onChange(ids.filter((_, i) => i !== index));

    const move = (index: number, delta: -1 | 1) => {
        const to = index + delta;
        if (to < 0 || to >= ids.length) return;
        const next = [...ids];
        [next[index], next[to]] = [next[to], next[index]];
        onChange(next);
    };

    return (
        <div className="space-y-2">
            {label}
            {ids.length === 0 ? (
                <p className="text-muted-foreground text-sm">None chosen.</p>
            ) : (
                <ol className="divide-y rounded-md border" aria-label={field.displayName}>
                    {ids.map((id, index) => (
                        <ReferenceRow
                            key={id}
                            id={id}
                            known={known[id]}
                            first={index === 0}
                            last={index === ids.length - 1}
                            onUp={() => move(index, -1)}
                            onDown={() => move(index, 1)}
                            onRemove={() => remove(index)}
                        />
                    ))}
                </ol>
            )}
            <div className="flex items-center gap-3">
                <Button
                    ref={triggerRef}
                    id={field.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-haspopup="dialog"
                    disabled={full}
                    onClick={() => setOpen(true)}
                >
                    <IconPlus className="size-3.5" />
                    Add {targetLabel}
                </Button>
                <span className="text-muted-foreground text-xs">
                    {full ? `A list holds at most ${MAX_REFERENCES} entries.` : `${ids.length} of at most ${MAX_REFERENCES}`}
                </span>
            </div>
            <FieldError message={error} />

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="overflow-hidden p-0"
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        triggerRef.current?.focus();
                    }}
                >
                    <DialogHeader className="sr-only">
                        <DialogTitle>Add {targetLabel}</DialogTitle>
                        <DialogDescription>
                            Search {targetLabel} entries and add one to {field.displayName}.
                        </DialogDescription>
                    </DialogHeader>
                    {/* The server searches, so cmdk must not filter what came back as well. */}
                    <Command shouldFilter={false}>
                        <CommandInput value={search} onValueChange={setSearch} placeholder={`Search ${targetLabel}`} />
                        <CommandList>
                            {isLoading || typesLoading ? (
                                <p className="text-muted-foreground py-6 text-center text-sm">Searching...</p>
                            ) : listFailed ? (
                                <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
                                    <p className="text-muted-foreground text-sm">
                                        {apiErrorMessage(listError, `The ${targetLabel} entries could not be read.`)}
                                    </p>
                                    <Button type="button" variant="outline" size="sm" onClick={() => void refetchList()}>
                                        Try again
                                    </Button>
                                </div>
                            ) : entries.length === 0 ? (
                                <CommandEmpty>
                                    {query
                                        ? `No ${targetLabel} entries match that search.`
                                        : `There are no ${targetLabel} entries yet.`}
                                </CommandEmpty>
                            ) : (
                                entries.map((entry) => {
                                    const chosen = ids.includes(entry.id);
                                    return (
                                        <CommandItem
                                            key={entry.id}
                                            value={entry.id}
                                            disabled={chosen}
                                            onSelect={() => add(entry)}
                                        >
                                            <span className="truncate">{contentTitle(entry.data, entry.id)}</span>
                                            <span className="text-muted-foreground ml-auto text-[11px]">
                                                {chosen ? 'Added' : <span className="font-mono">{entry.id.slice(0, 8)}</span>}
                                            </span>
                                        </CommandItem>
                                    );
                                })
                            )}
                        </CommandList>
                    </Command>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function ReferenceRow({
    id,
    known,
    first,
    last,
    onUp,
    onDown,
    onRemove,
}: {
    id: string;
    known?: ContentListItem;
    first: boolean;
    last: boolean;
    onUp: () => void;
    onDown: () => void;
    onRemove: () => void;
}) {
    // One read per row not picked on this screen, at most a hundred, cached by id like every entry.
    const { data: fetched, isError, error } = useContent(id, !known);
    const entry = known ?? fetched;
    const title = entry ? contentTitle(entry.data, entry.id) : '';
    const name = title || id;

    return (
        <li className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
                {title || <span className="font-mono text-xs">{id}</span>}
                {!entry && isError && (
                    <span className="text-muted-foreground ml-2 text-xs">
                        {isNotFound(error) ? 'Not an entry this console can read.' : 'Could not be read.'}
                    </span>
                )}
            </span>
            <Button type="button" variant="ghost" size="icon" disabled={first} onClick={onUp} aria-label={`Move ${name} up`}>
                <IconChevronDown className="size-3 rotate-180" />
            </Button>
            <Button type="button" variant="ghost" size="icon" disabled={last} onClick={onDown} aria-label={`Move ${name} down`}>
                <IconChevronDown className="size-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${name}`}>
                <IconTimes className="size-3.5" />
            </Button>
        </li>
    );
}
