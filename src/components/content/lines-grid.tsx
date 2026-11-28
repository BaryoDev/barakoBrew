'use client';

import { fieldValueKey, type Viewer } from 'barako-content-form';
import { DynamicForm } from '@/components/content/dynamic-form';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    MAX_LINES,
    columnAmounts,
    declaredScale,
    lineColumns,
    linePosition,
    sameName,
    sumAmounts,
    totalDiffers,
} from '@/lib/lines';
import type { ContentTypeDefinition, FieldDefinition, LinesDefinition } from '@/types/schema';

/** One line being entered. The id is only for React and for telling the rows' inputs apart. */
export interface LineRow {
    id: number;
    values: Record<string, unknown>;
}

export function nextRowId(rows: readonly LineRow[]): number {
    return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

/**
 * The lines of a new entry, entered next to its fields and saved with it in one go.
 *
 * Columns are the line type's fields that are typed in: the field that points back at the entry is
 * set by the server, and computed and rolled up fields are worked out there. When the type checks
 * a total, the sum of the amount column is shown and compared with the total as it is entered.
 */
export function LinesGrid({
    lines,
    lineType,
    header,
    headerValues,
    rows,
    onChange,
    refusals = [],
    viewer,
}: {
    lines: LinesDefinition;
    lineType: ContentTypeDefinition;
    header: ContentTypeDefinition;
    headerValues: Record<string, unknown>;
    rows: LineRow[];
    onChange: (rows: LineRow[]) => void;
    /** The server's refusals that concern the lines: a line by position, or the total. */
    refusals?: string[];
    viewer?: Viewer;
}) {
    const columns = lineColumns(lineType, lines.parentField);
    const full = rows.length >= MAX_LINES;
    const rowRefusals = (position: number) => refusals.filter((r) => linePosition(r) === position);
    // A line refusal naming a row that is not there any more has no row to sit under.
    const otherRefusals = refusals.filter((r) => {
        const position = linePosition(r);
        return position === null || position > rows.length;
    });

    const setValues = (id: number, values: Record<string, unknown>) =>
        onChange(rows.map((r) => (r.id === id ? { ...r, values } : r)));

    return (
        <section aria-labelledby="lines-grid-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <h2 id="lines-grid-heading" className="text-sm font-medium">
                    {lineType.displayName}
                </h2>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={full}
                    onClick={() => onChange([...rows, { id: nextRowId(rows), values: {} }])}
                >
                    Add line
                </Button>
            </div>

            {columns.length === 0 && <p className="text-muted-foreground text-sm">Nothing to enter on a line.</p>}

            {rows.length === 0 ? (
                <p className="text-muted-foreground text-sm">No lines yet.</p>
            ) : (
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-16">Line</TableHead>
                                {columns.map((f) => (
                                    <TableHead key={f.name}>{f.displayName}</TableHead>
                                ))}
                                <TableHead className="w-24">
                                    <span className="sr-only">Remove</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row, index) => (
                                <LineRowView
                                    key={row.id}
                                    row={row}
                                    position={index + 1}
                                    columns={columns}
                                    lineType={lineType}
                                    viewer={viewer}
                                    refusals={rowRefusals(index + 1)}
                                    onValues={(values) => setValues(row.id, values)}
                                    onRemove={() => onChange(rows.filter((r) => r.id !== row.id))}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {full && <p className="text-muted-foreground text-xs">An entry takes at most {MAX_LINES} lines.</p>}

            <Total lines={lines} lineType={lineType} header={header} headerValues={headerValues} rows={rows} />

            {otherRefusals.length > 0 && (
                <ul role="alert" className="text-destructive space-y-1 text-sm">
                    {otherRefusals.map((r, i) => (
                        <li key={i}>{r}</li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function LineRowView({
    row,
    position,
    columns,
    lineType,
    viewer,
    refusals,
    onValues,
    onRemove,
}: {
    row: LineRow;
    position: number;
    columns: FieldDefinition[];
    lineType: ContentTypeDefinition;
    viewer?: Viewer;
    refusals: string[];
    onValues: (values: Record<string, unknown>) => void;
    onRemove: () => void;
}) {
    return (
        <>
            <TableRow>
                <TableCell className="text-muted-foreground align-top">{position}</TableCell>
                {columns.map((field) => {
                    // Named per row, because the form draws the field's name as its element id and
                    // two rows on one page cannot share one.
                    const scoped = `line${row.id}-${field.name}`;
                    const key = fieldValueKey(row.values, field.name);
                    return (
                        <TableCell key={field.name} className="min-w-40 align-top [&_label]:sr-only">
                            <DynamicForm
                                fields={[{ ...field, name: scoped }]}
                                values={{ [scoped]: row.values[key] }}
                                onChange={(next) => {
                                    const value = next[scoped];
                                    const values = { ...row.values };
                                    if (value === undefined) delete values[key];
                                    else values[key] = value;
                                    onValues(values);
                                }}
                                contentType={lineType.name}
                                viewer={viewer}
                            />
                        </TableCell>
                    );
                })}
                <TableCell className="align-top">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove line ${position}`}
                        onClick={onRemove}
                    >
                        Remove
                    </Button>
                </TableCell>
            </TableRow>
            {refusals.length > 0 && (
                <TableRow>
                    <TableCell colSpan={columns.length + 2} className="pt-0">
                        <ul role="alert" className="text-destructive space-y-1 text-sm">
                            {refusals.map((r, i) => (
                                <li key={i}>{r}</li>
                            ))}
                        </ul>
                    </TableCell>
                </TableRow>
            )}
        </>
    );
}

/** The sum of the amount column against the entry's total, when the type checks one. */
function Total({
    lines,
    lineType,
    header,
    headerValues,
    rows,
}: {
    lines: LinesDefinition;
    lineType: ContentTypeDefinition;
    header: ContentTypeDefinition;
    headerValues: Record<string, unknown>;
    rows: LineRow[];
}) {
    if (!lines.totalField || !lines.lineAmountField) return null;

    const amountField = lineType.fields.find((f) => sameName(f.name, lines.lineAmountField));
    const totalField = header.fields.find((f) => sameName(f.name, lines.totalField));
    const amountLabel = amountField?.displayName ?? lines.lineAmountField;
    const totalLabel = totalField?.displayName ?? lines.totalField;

    if (amountField?.computed) {
        return (
            <p className="text-muted-foreground text-sm">
                The sum of {amountLabel} is worked out when the entry is saved, and {totalLabel} is checked
                against it.
            </p>
        );
    }

    const sum = sumAmounts(columnAmounts(rows.map((r) => r.values), lines.lineAmountField), declaredScale(amountField));
    const entered = headerValues[fieldValueKey(headerValues, lines.totalField)];
    // A total the server works out is not entered here, so there is nothing to compare it with.
    const checkable = !totalField?.computed && !totalField?.rollup;
    const differs = checkable && (typeof entered !== 'number' || totalDiffers(sum, entered));

    return (
        <div className="space-y-1 text-sm">
            <p>
                Sum of {amountLabel}: <span className="font-mono">{sum.text}</span>
            </p>
            {differs && (
                <p role="status" className="text-warning">
                    {typeof entered === 'number'
                        ? `${totalLabel} is ${entered}, but the lines add up to ${sum.text}.`
                        : `${totalLabel} is not entered. It has to equal the lines, ${sum.text}.`}
                </p>
            )}
        </div>
    );
}
