'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTransitionContent } from '@/hooks/use-contents';
import { apiErrorMessage } from '@/lib/api';
import { missingTransitionFields, transitionFields } from '@/lib/transitions';
import { DynamicForm } from '@/components/content/dynamic-form';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { FieldDefinition, StateTransition } from '@/types/schema';

/**
 * The buttons for a type's own transitions, and the form a transition opens when it asks for
 * fields.
 *
 * Every transition of the type is offered. The entry read does not say which state the entry is in,
 * so this cannot narrow the list to the moves from that state; the API refuses a move from the
 * wrong state, and its message is shown.
 */
export function TransitionActions({
    entryId,
    contentType,
    transitions,
    fields,
    viewerRoles,
}: {
    entryId: string;
    contentType: string;
    transitions: readonly StateTransition[];
    fields: readonly FieldDefinition[];
    viewerRoles?: readonly string[];
}) {
    const [asking, setAsking] = useState<StateTransition | null>(null);
    const move = useTransitionContent();

    const run = (transition: StateTransition) => {
        if (transitionFields(transition, fields).length > 0) {
            setAsking(transition);
            return;
        }
        move.mutate(
            { id: entryId, transition: transition.name },
            {
                onSuccess: (result) => toast.success(result?.message || `${transition.name} done`),
                onError: (error) => toast.error(apiErrorMessage(error, `${transition.name} could not be done.`)),
            },
        );
    };

    return (
        <>
            {transitions.map((transition) => (
                <Button
                    key={transition.name}
                    size="sm"
                    variant="outline"
                    title={`${transition.from} to ${transition.to}`}
                    disabled={move.isPending}
                    onClick={() => run(transition)}
                >
                    {transition.name}
                </Button>
            ))}
            {asking && (
                <TransitionDialog
                    key={asking.name}
                    entryId={entryId}
                    contentType={contentType}
                    transition={asking}
                    fields={fields}
                    viewerRoles={viewerRoles}
                    open
                    onOpenChange={(open) => {
                        if (!open) setAsking(null);
                    }}
                />
            )}
        </>
    );
}

/** Asks for the fields a transition takes, then makes the move with their values. */
export function TransitionDialog({
    entryId,
    contentType,
    transition,
    fields,
    viewerRoles,
    open,
    onOpenChange,
}: {
    entryId: string;
    contentType: string;
    transition: StateTransition;
    fields: readonly FieldDefinition[];
    viewerRoles?: readonly string[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [refusal, setRefusal] = useState<string | null>(null);
    const move = useTransitionContent();

    const asked = transitionFields(transition, fields);
    // The form marks what the move needs, which is not what the field needs on an ordinary save.
    const formFields = asked.map((a) => ({ ...a.field, isRequired: a.required }));
    const missing = missingTransitionFields(asked, values);

    const confirm = () =>
        move.mutate(
            { id: entryId, transition: transition.name, data: values },
            {
                onSuccess: (result) => {
                    toast.success(result?.message || `${transition.name} done`);
                    onOpenChange(false);
                },
                onError: (error) => setRefusal(apiErrorMessage(error, `${transition.name} could not be done.`)),
            },
        );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{transition.name}</DialogTitle>
                    <DialogDescription>
                        Moves the entry from {transition.from} to {transition.to}. These values are saved with
                        the move.
                    </DialogDescription>
                </DialogHeader>

                <DynamicForm
                    fields={formFields}
                    values={values}
                    onChange={(next) => {
                        setRefusal(null);
                        setValues(next);
                    }}
                    contentType={contentType}
                    viewerRoles={viewerRoles}
                />

                {missing.length > 0 && (
                    <p className="text-muted-foreground text-xs">
                        Needed for this move: {missing.map((f) => f.displayName).join(', ')}.
                    </p>
                )}
                {refusal && (
                    <p role="alert" className="text-destructive text-sm">
                        {refusal}
                    </p>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="button" disabled={missing.length > 0 || move.isPending} onClick={confirm}>
                        {move.isPending ? 'Saving...' : transition.name}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
