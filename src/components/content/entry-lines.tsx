'use client';

import Link from 'next/link';
import { useEntryLines } from '@/hooks/use-contents';
import { useSchemas } from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import { MAX_LINES, findType, sameName } from '@/lib/lines';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { ContentTypeDefinition } from '@/types/schema';

/** A stored value as text. Server text is only ever rendered as text here, never as markup. */
function cellText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function valueOf(data: Record<string, unknown>, name: string): unknown {
    const key = Object.keys(data).find((k) => sameName(k, name));
    return key === undefined ? undefined : data[key];
}

/**
 * The lines an entry holds, read only. Each links to the line's own entry page, which is where it
 * is edited. The list stops at 200 and says so when there are more.
 */
export function EntryLinesSection({ id, schema }: { id: string; schema: ContentTypeDefinition }) {
    const lines = schema.lines;
    const { data: types = [] } = useSchemas();
    const { data, isLoading, isError, error } = useEntryLines(id, !!lines);
    if (!lines) return null;

    const lineType = findType(types, lines.contentType);
    const columns = lineType
        ? lineType.fields.filter((f) => !sameName(f.name, lines.parentField))
        : Object.keys(data?.lines[0]?.data ?? {})
              .filter((k) => !sameName(k, lines.parentField))
              .map((name) => ({ name, displayName: name }));

    return (
        <section aria-labelledby="entry-lines-heading" className="mt-8 space-y-3">
            <h2 id="entry-lines-heading" className="text-sm font-medium">
                {lineType?.displayName ?? lines.contentType}
            </h2>

            {isLoading && <p className="text-muted-foreground text-sm">Loading lines...</p>}
            {isError && (
                <p role="alert" className="text-destructive text-sm">
                    {apiErrorMessage(error, 'The lines could not be read.')}
                </p>
            )}

            {data && data.lines.length === 0 && <p className="text-muted-foreground text-sm">No lines.</p>}

            {data && data.lines.length > 0 && (
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-24">Line</TableHead>
                                {columns.map((f) => (
                                    <TableHead key={f.name}>{f.displayName}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.lines.map((line, index) => (
                                <TableRow key={line.id}>
                                    <TableCell>
                                        <Link
                                            href={`/content/${line.id}`}
                                            className="underline underline-offset-2"
                                            aria-label={`Open line ${index + 1}`}
                                        >
                                            {index + 1}
                                        </Link>
                                    </TableCell>
                                    {columns.map((f) => (
                                        <TableCell key={f.name}>{cellText(valueOf(line.data, f.name))}</TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {data?.truncated && (
                <p className="text-muted-foreground text-xs">
                    This entry has more lines than are listed here. The first {MAX_LINES} are shown.
                </p>
            )}
        </section>
    );
}
