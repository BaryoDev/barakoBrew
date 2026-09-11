'use client';

import { useState } from 'react';
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
import { IconSearch, IconTimes } from '@/components/icons';
import { FieldError } from '@/components/content/field-error';
import { useContent, useContents } from '@/hooks/use-contents';
import { useSchemas } from '@/hooks/use-schemas';
import { useDebounced } from '@/hooks/use-debounced';
import { contentTitle } from '@/lib/content-title';
import type { FieldDefinition } from '@/types/schema';

interface ReferenceFieldProps {
    field: FieldDefinition;
    /** The content type the value points at, already known to be present. */
    referenceType: string;
    label: React.ReactNode;
    value: unknown;
    error?: string;
    onChange: (value: unknown) => void;
}

/**
 * A reference as a search over the target type, not as a GUID to paste.
 *
 * The value on the wire is still the target entry's id, which is all the API has ever accepted. The
 * difference is that nothing here asks a person to produce one: the list is searched by the words
 * they can see, and every row, the chosen one included, reads as the entry's title.
 */
export function ReferenceField({
    field,
    referenceType,
    label,
    value,
    error,
    onChange,
}: ReferenceFieldProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const query = useDebounced(search, 300);

    const selectedId = typeof value === 'string' ? value : '';

    const { data: schemas } = useSchemas();
    // referenceType and the type's own name are compared case-insensitively by the API, and a
    // definition can spell it either way, but the entry list filters on an exact match. So query
    // with the spelling the type itself carries, and fall back to what the definition said when the
    // console cannot see that type at all.
    const target = schemas?.find((s) => s.name.toLowerCase() === referenceType.toLowerCase());
    const queryType = target?.name ?? referenceType;
    const targetLabel = target?.displayName ?? referenceType;

    // Only once the dialog is open. A form can carry several references, and fetching a page of
    // every target type on load is work for lists nobody has asked to see.
    const { data: page, isLoading } = useContents(
        { contentType: queryType, search: query || undefined, page: 1, pageSize: 20 },
        open
    );
    const entries = page?.items ?? [];

    // The entry just chosen is already in hand, so its title is on screen the moment it is picked.
    const listed = entries.find((e) => e.id === selectedId);

    // One that is not. A value loaded with the entry being edited is usually not in the page a
    // search happens to return, and the trigger has to read as a title before anything is opened.
    const { data: fetched, isError: selectedFailed } = useContent(selectedId, !listed);

    const resolved = listed ?? fetched;
    const selectedTitle = resolved ? contentTitle(resolved.data, resolved.id) : '';

    const choose = (id: string) => {
        onChange(id);
        setSearch('');
        setOpen(false);
    };

    const clear = () => {
        onChange(null);
        setSearch('');
    };

    return (
        <div className="space-y-2">
            {label}
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    id={field.name}
                    variant="outline"
                    aria-haspopup="dialog"
                    className="min-w-0 flex-1 justify-start font-normal"
                    onClick={() => setOpen(true)}
                >
                    <IconSearch className="size-3.5 shrink-0" />
                    {selectedId ? (
                        <span className="truncate">
                            {/* The id, only when there is nothing better to show: the entry is gone,
                                or the value was never an id this API knows. */}
                            {selectedTitle || (
                                <span className="font-mono text-xs">{selectedId}</span>
                            )}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">Choose {targetLabel}</span>
                    )}
                </Button>
                {selectedId && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={clear}
                        aria-label={`Clear ${field.displayName}`}
                    >
                        <IconTimes className="size-3.5" />
                    </Button>
                )}
            </div>
            {selectedId && selectedFailed && (
                <p className="text-muted-foreground text-xs">
                    This id does not resolve to an entry this console can read.
                </p>
            )}
            <FieldError message={error} />

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="overflow-hidden p-0">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Choose {targetLabel}</DialogTitle>
                        <DialogDescription>
                            Search {targetLabel} entries and pick one for {field.displayName}.
                        </DialogDescription>
                    </DialogHeader>
                    {/* The server does the searching, so cmdk must not also filter what came back:
                        it matches on the rendered text, and an entry found by a field the row does
                        not show would be fetched and then hidden. */}
                    <Command shouldFilter={false}>
                        <CommandInput
                            value={search}
                            onValueChange={setSearch}
                            placeholder={`Search ${targetLabel}`}
                        />
                        <CommandList>
                            {isLoading ? (
                                <p className="text-muted-foreground py-6 text-center text-sm">
                                    Searching…
                                </p>
                            ) : entries.length === 0 ? (
                                <CommandEmpty>
                                    {query
                                        ? `No ${targetLabel} entries match that search.`
                                        : `There are no ${targetLabel} entries yet.`}
                                </CommandEmpty>
                            ) : (
                                entries.map((entry) => (
                                    <CommandItem
                                        key={entry.id}
                                        value={entry.id}
                                        onSelect={() => choose(entry.id)}
                                    >
                                        <span className="truncate">
                                            {contentTitle(entry.data, entry.id)}
                                        </span>
                                        <span className="text-muted-foreground ml-auto font-mono text-[11px]">
                                            {entry.id.slice(0, 8)}
                                        </span>
                                    </CommandItem>
                                ))
                            )}
                        </CommandList>
                    </Command>
                </DialogContent>
            </Dialog>
        </div>
    );
}
