'use client';

import { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
    DUPLICATES_PAGE_SIZE,
    useSetUniqueness,
    useUniquenessDuplicates,
} from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import {
    MAX_RULES,
    comparableFields,
    ruleFieldLabel,
    ruleProblem,
    rulesToSend,
} from '@/lib/uniqueness';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
import { CREATED_BY_FIELD, type ContentTypeDefinition, type UniquenessRule } from '@/types/schema';

const ANY_STATE = '__any';

/**
 * A type's uniqueness rules: the values only one entry may hold at a time.
 *
 * Shown as stored, edited as a whole list (the endpoint replaces the list), and each rule can list
 * the entries that already share their values, which is how somebody finds what a forced rule left.
 */
export function UniquenessPanel({ schema }: { schema: ContentTypeDefinition }) {
    const rules = schema.uniqueness ?? [];
    const [editing, setEditing] = useState(false);
    const [listing, setListing] = useState<string | null>(null);
    const [shared, setShared] = useState<{ rule: string; entries: number }[]>([]);

    return (
        <section aria-labelledby="uniqueness-heading" className="mb-6 space-y-3 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h2 id="uniqueness-heading" className="text-sm font-medium">
                        Uniqueness rules
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Values only one entry may hold at a time. A save that would make a second one is
                        refused.
                    </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                    Edit rules
                </Button>
            </div>

            {rules.length === 0 ? (
                <p className="text-muted-foreground text-sm">No rules.</p>
            ) : (
                <ul className="divide-y rounded-md border">
                    {rules.map((rule) => (
                        <li key={rule.name} className="space-y-2 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm">
                                    <span className="font-medium">{rule.name}</span>
                                    <span className="text-muted-foreground">
                                        {' '}
                                        · one entry per{' '}
                                        {rule.fields.map((f) => ruleFieldLabel(f, schema.fields)).join(' and ')}
                                        {rule.whenState ? ` while ${rule.whenState}` : ''}
                                    </span>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-expanded={listing === rule.name}
                                    onClick={() => setListing(listing === rule.name ? null : rule.name)}
                                >
                                    {listing === rule.name ? 'Hide entries sharing values' : 'Entries sharing values'}
                                </Button>
                            </div>
                            <SharedNote count={shared.find((s) => s.rule === rule.name)?.entries ?? 0} />
                            {listing === rule.name && <DuplicatesList typeName={schema.name} rule={rule.name} />}
                        </li>
                    ))}
                </ul>
            )}

            {editing && (
                <UniquenessDialog
                    schema={schema}
                    open
                    onOpenChange={setEditing}
                    onSaved={(duplicates) => setShared(duplicates)}
                />
            )}
        </section>
    );
}

function SharedNote({ count }: { count: number }) {
    if (count === 0) return null;
    return (
        <p className="text-warning text-xs">
            {count === 1 ? '1 entry already shared its values' : `${count} entries already shared their values`} when
            this rule was saved. They are left as they are.
        </p>
    );
}

function DuplicatesList({ typeName, rule }: { typeName: string; rule: string }) {
    const [page, setPage] = useState(1);
    const { data, isLoading, isError, error } = useUniquenessDuplicates(typeName, rule, page);

    if (isLoading) return <p className="text-muted-foreground text-xs">Loading...</p>;
    if (isError || !data) {
        return (
            <p role="alert" className="text-destructive text-xs">
                {apiErrorMessage(error, 'The entries could not be listed.')}
            </p>
        );
    }
    if (data.items.length === 0) {
        return <p className="text-muted-foreground text-xs">No entries share their values under this rule.</p>;
    }

    return (
        <div className="space-y-2">
            <ul className="space-y-1 text-xs">
                {data.items.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2">
                        <Link href={`/content/${entry.id}`} className="font-mono underline underline-offset-2">
                            {entry.id}
                        </Link>
                        <span className="text-muted-foreground">created {format(new Date(entry.createdAt), 'PPp')}</span>
                    </li>
                ))}
            </ul>
            {data.totalItems > DUPLICATES_PAGE_SIZE && (
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                        Previous
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={page * DUPLICATES_PAGE_SIZE >= data.totalItems}
                        onClick={() => setPage(page + 1)}
                    >
                        Next
                    </Button>
                </div>
            )}
        </div>
    );
}

export function UniquenessDialog({
    schema,
    open,
    onOpenChange,
    onSaved,
}: {
    schema: ContentTypeDefinition;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved?: (duplicates: { rule: string; entries: number }[]) => void;
}) {
    const [rules, setRules] = useState<UniquenessRule[]>(() =>
        (schema.uniqueness ?? []).map((r) => ({ ...r, fields: [...r.fields] })),
    );
    const [refusal, setRefusal] = useState<string | null>(null);
    const setUniqueness = useSetUniqueness(schema.name);
    const candidates = comparableFields(schema.fields);
    const states = schema.lifecycle?.states ?? [];

    const problems = rules.map((rule, i) => ruleProblem(rule, rules.filter((_, j) => j !== i)));
    const invalid = problems.some((p) => p !== null);

    const edit = (index: number, change: Partial<UniquenessRule>) => {
        setRefusal(null);
        setRules((current) => current.map((r, i) => (i === index ? { ...r, ...change } : r)));
    };

    const toggleField = (index: number, name: string, on: boolean) => {
        const fields = rules[index].fields;
        edit(index, { fields: on ? [...fields, name] : fields.filter((f) => f !== name) });
    };

    const send = (force: boolean) =>
        setUniqueness.mutate(
            { uniqueness: rulesToSend(rules), force },
            {
                onSuccess: (result) => {
                    const duplicates = result?.duplicates ?? [];
                    onSaved?.(duplicates);
                    toast.success('Rules saved');
                    onOpenChange(false);
                },
                onError: (error) => {
                    const message = apiErrorMessage(error, 'The rules could not be saved.');
                    if (axios.isAxiosError(error) && error.response?.status === 409) setRefusal(message);
                    else toast.error(message);
                },
            },
        );

    const choices = [
        ...candidates.map((f) => ({ name: f.name, label: f.displayName })),
        { name: CREATED_BY_FIELD, label: 'Created by' },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Uniqueness rules for {schema.displayName}</DialogTitle>
                    <DialogDescription>
                        The list replaces the type&apos;s rules. Only Public fields holding one value can be
                        compared. Entries that already share values are left as they are.
                    </DialogDescription>
                </DialogHeader>

                {rules.length === 0 && <p className="text-muted-foreground text-sm">No rules.</p>}

                <ol className="space-y-4">
                    {rules.map((rule, index) => (
                        <li key={index} className="space-y-3 rounded-lg border p-3">
                            <div className="flex items-end gap-2">
                                <div className="flex-1 space-y-2">
                                    <Label htmlFor={`rule-name-${index}`}>Rule name</Label>
                                    <Input
                                        id={`rule-name-${index}`}
                                        value={rule.name}
                                        placeholder="OneEntryPerEmail"
                                        className="font-mono"
                                        onChange={(e) => edit(index, { name: e.target.value })}
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Remove rule ${rule.name || index + 1}`}
                                    onClick={() => {
                                        setRefusal(null);
                                        setRules((current) => current.filter((_, i) => i !== index));
                                    }}
                                >
                                    Remove
                                </Button>
                            </div>
                            <fieldset className="space-y-2">
                                <legend className="text-sm font-medium">Compared together</legend>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {choices.map((choice) => {
                                        const id = `rule-${index}-field-${choice.name}`;
                                        return (
                                            <div key={choice.name} className="flex items-center gap-2">
                                                <Checkbox
                                                    id={id}
                                                    checked={rule.fields.includes(choice.name)}
                                                    onCheckedChange={(checked) =>
                                                        toggleField(index, choice.name, checked === true)
                                                    }
                                                />
                                                <Label htmlFor={id} className="font-normal">
                                                    {choice.label}
                                                </Label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </fieldset>
                            {states.length > 0 && (
                                <div className="space-y-2">
                                    <Label htmlFor={`rule-state-${index}`}>Counts entries</Label>
                                    <Select
                                        value={rule.whenState || ANY_STATE}
                                        onValueChange={(v) => edit(index, { whenState: v === ANY_STATE ? null : v })}
                                    >
                                        <SelectTrigger id={`rule-state-${index}`} className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={ANY_STATE}>In any state</SelectItem>
                                            {states.map((s) => (
                                                <SelectItem key={s} value={s}>
                                                    While {s}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            {problems[index] && <p className="text-destructive text-xs">{problems[index]}</p>}
                        </li>
                    ))}
                </ol>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={rules.length >= MAX_RULES}
                    onClick={() => {
                        setRefusal(null);
                        setRules((current) => [...current, { name: '', fields: [] }]);
                    }}
                >
                    Add rule
                </Button>

                {refusal && (
                    <div
                        role="alert"
                        className="border-warning/40 bg-[var(--warning-soft)] text-warning space-y-2 rounded-lg border px-4 py-3 text-sm"
                    >
                        <p>{refusal}</p>
                        <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={setUniqueness.isPending}
                            onClick={() => send(true)}
                        >
                            Save anyway
                        </Button>
                    </div>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={invalid || setUniqueness.isPending || refusal !== null}
                        onClick={() => send(false)}
                    >
                        {setUniqueness.isPending ? 'Saving...' : 'Save rules'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
