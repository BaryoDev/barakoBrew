'use client';

import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useSetFieldOptions } from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import { hasOptionIssues, optionIssues } from '@/lib/choice';
import { OptionsEditor } from '@/components/schema/options-editor';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { FieldDefinition, FieldOption } from '@/types/schema';

/**
 * Changes the options of a choice field on a type that already exists.
 *
 * Relabelling, reordering and adding change no entry. Removing an option entries hold is refused
 * with a 409 that says how many; the API's message is shown as it is, with a button that resends the
 * same list with `force`.
 */
export function FieldOptionsDialog({
    typeName,
    field,
    open,
    onOpenChange,
}: {
    typeName: string;
    field: FieldDefinition;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [options, setOptions] = useState<FieldOption[]>(field.options ?? []);
    const [refusal, setRefusal] = useState<string | null>(null);
    const setFieldOptions = useSetFieldOptions(typeName, field.name);
    const invalid = hasOptionIssues(optionIssues(options));

    const send = (force: boolean) =>
        setFieldOptions.mutate(
            { options, force },
            {
                onSuccess: (result) => {
                    const held = result?.entriesHoldingRemoved ?? 0;
                    toast.success(
                        held > 0
                            ? `Options saved. ${held} ${held === 1 ? 'entry holds' : 'entries hold'} a removed value and must pick another on its next save.`
                            : 'Options saved',
                    );
                    onOpenChange(false);
                },
                onError: (error) => {
                    const message = apiErrorMessage(error, 'The options could not be saved.');
                    if (axios.isAxiosError(error) && error.response?.status === 409) setRefusal(message);
                    else toast.error(message);
                },
            },
        );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Options for {field.displayName}</DialogTitle>
                    <DialogDescription>
                        Rewording, reordering and adding options change no entry. Removing an option
                        entries still hold needs a second confirmation.
                    </DialogDescription>
                </DialogHeader>

                <OptionsEditor
                    options={options}
                    onChange={(next) => {
                        // A confirmation was for the list the API saw, not for this one.
                        setRefusal(null);
                        setOptions(next);
                    }}
                />

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
                            disabled={setFieldOptions.isPending}
                            onClick={() => send(true)}
                        >
                            Remove anyway
                        </Button>
                    </div>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={invalid || setFieldOptions.isPending || refusal !== null}
                        onClick={() => send(false)}
                    >
                        {setFieldOptions.isPending ? 'Saving…' : 'Save options'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
