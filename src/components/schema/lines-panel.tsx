'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useSchemas, useSetLines } from '@/hooks/use-schemas';
import { apiErrorList, apiErrorMessage } from '@/lib/api';
import {
    findType,
    headerOf,
    isSummable,
    lineTypeChoices,
    parentFieldChoices,
    sameName,
} from '@/lib/lines';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { ContentTypeDefinition, FieldDefinition, LinesDefinition } from '@/types/schema';

const NONE = '__none';

function fieldLabel(fields: readonly FieldDefinition[] | undefined, name: string | null | undefined) {
    if (!name) return '';
    return fields?.find((f) => sameName(f.name, name))?.displayName ?? name;
}

/**
 * A type's lines: another type whose entries point back at this one, as the lines of an order do.
 *
 * Shown as stored and edited in a dialog. The server decides what is allowed and says why, so a
 * refusal is shown as it comes, one reason to a line.
 */
export function LinesPanel({ schema }: { schema: ContentTypeDefinition }) {
    const { data: types = [] } = useSchemas();
    const [editing, setEditing] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [refusal, setRefusal] = useState<string[]>([]);
    const setLines = useSetLines(schema.name);

    const lines = schema.lines ?? null;
    const lineType = findType(types, lines?.contentType);
    const header = headerOf(types, schema.name);

    const clear = () =>
        setLines.mutate(null, {
            onSuccess: () => {
                setRefusal([]);
                toast.success('Lines cleared');
            },
            onError: (error) => setRefusal(refusalLines(error, 'The lines could not be cleared.')),
        });

    return (
        <section aria-labelledby="lines-heading" className="mb-6 space-y-3 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h2 id="lines-heading" className="text-sm font-medium">
                        Lines
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Another type whose entries point back at this one, such as the lines of an order. An
                        entry of this type is created with its lines in one save.
                    </p>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!!header}
                        onClick={() => {
                            setRefusal([]);
                            setEditing(true);
                        }}
                    >
                        {lines ? 'Edit lines' : 'Set lines'}
                    </Button>
                    {lines && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={setLines.isPending}
                            onClick={() => setClearing(true)}
                        >
                            Clear lines
                        </Button>
                    )}
                </div>
            </div>

            {header ? (
                <p className="text-muted-foreground text-sm">
                    This type is the line type of {header.displayName}, so it cannot have lines of its own.
                </p>
            ) : lines ? (
                <ul className="divide-y rounded-md border text-sm">
                    <li className="px-3 py-2">
                        <span className="font-medium">{lineType?.displayName ?? lines.contentType}</span>
                        <span className="text-muted-foreground">
                            {' '}
                            · points back through {fieldLabel(lineType?.fields, lines.parentField)}
                        </span>
                    </li>
                    {lines.totalField && lines.lineAmountField && (
                        <li className="text-muted-foreground px-3 py-2">
                            {fieldLabel(schema.fields, lines.totalField)} has to equal the sum of{' '}
                            {fieldLabel(lineType?.fields, lines.lineAmountField)}
                        </li>
                    )}
                </ul>
            ) : (
                <p className="text-muted-foreground text-sm">No lines.</p>
            )}

            {refusal.length > 0 && <Refusal lines={refusal} />}

            {editing && <LinesDialog schema={schema} types={types} open onOpenChange={setEditing} />}

            <ConfirmDialog
                open={clearing}
                onOpenChange={setClearing}
                title="Clear the lines of this type?"
                description="New entries of this type take no lines. Entries and lines already saved are left as they are."
                confirmLabel="Clear lines"
                destructive
                onConfirm={clear}
            />
        </section>
    );
}

/** A refused write as one reason per line. A 409 is the server's one message. */
function refusalLines(error: unknown, fallback: string): string[] {
    const message = apiErrorMessage(error, fallback);
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 409) return [message];
    const list = apiErrorList(error);
    return list.length > 0 ? list : [message];
}

function Refusal({ lines }: { lines: string[] }) {
    return (
        <ul role="alert" className="text-destructive space-y-1 text-sm">
            {lines.map((line, i) => (
                <li key={i}>{line}</li>
            ))}
        </ul>
    );
}

export function LinesDialog({
    schema,
    types,
    open,
    onOpenChange,
}: {
    schema: ContentTypeDefinition;
    types: readonly ContentTypeDefinition[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const current = schema.lines ?? null;
    const [lineTypeName, setLineTypeName] = useState(findType(types, current?.contentType)?.name ?? '');
    const [parentField, setParentField] = useState(current?.parentField ?? '');
    const [totalField, setTotalField] = useState(current?.totalField ?? '');
    const [amountField, setAmountField] = useState(current?.lineAmountField ?? '');
    const [refusal, setRefusal] = useState<string[]>([]);
    const setLines = useSetLines(schema.name);

    const choices = lineTypeChoices(types, schema);
    const lineType = findType(types, lineTypeName);
    const parents = lineType ? parentFieldChoices(lineType, schema.name) : [];
    const totals = schema.fields.filter(isSummable);
    const amounts = lineType?.fields.filter(isSummable) ?? [];

    const half = (totalField === '') !== (amountField === '');
    const valid = !!lineType && parentField !== '' && !half;

    const send = () => {
        if (!lineType) return;
        const lines: LinesDefinition = { contentType: lineType.name, parentField };
        if (totalField && amountField) {
            lines.totalField = totalField;
            lines.lineAmountField = amountField;
        }
        setLines.mutate(lines, {
            onSuccess: () => {
                toast.success('Lines saved');
                onOpenChange(false);
            },
            onError: (error) => setRefusal(refusalLines(error, 'The lines could not be saved.')),
        });
    };

    const pick = (change: () => void) => {
        setRefusal([]);
        change();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Lines for {schema.displayName}</DialogTitle>
                    <DialogDescription>
                        Pick the type that holds the lines and the field on it that points back at this type.
                        A total can be checked against the lines on every save.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <Label htmlFor="lines-type">Line type</Label>
                    <Select
                        value={lineTypeName}
                        onValueChange={(v) =>
                            pick(() => {
                                setLineTypeName(v);
                                setParentField('');
                                setAmountField('');
                            })
                        }
                    >
                        <SelectTrigger id="lines-type" className="w-full">
                            <SelectValue placeholder="Choose a type" />
                        </SelectTrigger>
                        <SelectContent>
                            {choices.map((t) => (
                                <SelectItem key={t.name} value={t.name}>
                                    {t.displayName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {choices.length === 0 && (
                        <p className="text-muted-foreground text-xs">
                            No other type can be a line type. It has to have no lines of its own and not be the line
                            type of another type.
                        </p>
                    )}
                </div>

                {lineType && (
                    <div className="space-y-2">
                        <Label htmlFor="lines-parent">Field that points back</Label>
                        <Select
                            value={parentField}
                            onValueChange={(v) => pick(() => setParentField(v))}
                            disabled={parents.length === 0}
                        >
                            <SelectTrigger id="lines-parent" className="w-full">
                                <SelectValue placeholder="Choose a field" />
                            </SelectTrigger>
                            <SelectContent>
                                {parents.map((f) => (
                                    <SelectItem key={f.name} value={f.name}>
                                        {f.displayName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {parents.length === 0 && (
                            <p className="text-muted-foreground text-xs">
                                {lineType.displayName} needs a single reference field to {schema.displayName} first.
                                Add one to that type, then come back.
                            </p>
                        )}
                    </div>
                )}

                {lineType && parents.length > 0 && (
                    <fieldset className="space-y-3 rounded-lg border p-3">
                        <legend className="px-1 text-sm font-medium">Total check (optional)</legend>
                        <p className="text-muted-foreground text-xs">
                            Set both or neither. The total on {schema.displayName} has to equal the sum of the
                            amount on the lines.
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="lines-total">Total field</Label>
                            <Select
                                value={totalField || NONE}
                                onValueChange={(v) => pick(() => setTotalField(v === NONE ? '' : v))}
                            >
                                <SelectTrigger id="lines-total" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>No total</SelectItem>
                                    {totals.map((f) => (
                                        <SelectItem key={f.name} value={f.name}>
                                            {f.displayName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lines-amount">Line amount field</Label>
                            <Select
                                value={amountField || NONE}
                                onValueChange={(v) => pick(() => setAmountField(v === NONE ? '' : v))}
                            >
                                <SelectTrigger id="lines-amount" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>No amount</SelectItem>
                                    {amounts.map((f) => (
                                        <SelectItem key={f.name} value={f.name}>
                                            {f.displayName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {half && (
                            <p className="text-destructive text-xs">
                                Set the total field and the line amount field together, or leave both empty.
                            </p>
                        )}
                    </fieldset>
                )}

                {refusal.length > 0 && <Refusal lines={refusal} />}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="button" disabled={!valid || setLines.isPending} onClick={send}>
                        {setLines.isPending ? 'Saving...' : 'Save lines'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
