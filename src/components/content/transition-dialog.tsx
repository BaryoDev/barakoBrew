'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTransitionContent } from '@/hooks/use-contents';
import { apiErrorMessage } from '@/lib/api';
import { missingTransitionFields, requestedTransition, transitionFields } from '@/lib/transitions';
import { DynamicForm } from '@/components/content/dynamic-form';
import { isBlocksField } from '@/lib/blocks';
import { isMenuItemsField } from '@/lib/menu-tree';
import { chosenEditor } from '@/lib/field-presentation';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { Viewer } from 'barako-content-form';
import type { FieldDefinition, StateTransition } from '@/types/schema';

/** Takes `?transition=` off the address, so a reload or a shared link does not open the dialog again. */
function forgetRequestedTransition() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('transition')) return;
    url.searchParams.delete('transition');
    window.history.replaceState(window.history.state, '', url);
}

/**
 * The buttons for a type's own transitions, and the form a transition opens when it asks for
 * fields.
 *
 * Every transition of the type is offered. The entry read does not say which state the entry is in,
 * so this cannot narrow the list to the moves from that state; the API refuses a move from the
 * wrong state, and its message is shown.
 *
 * `requested` is the transition a link named. When the type declares it, its dialog opens on arrival,
 * asking first even for a move that takes no fields, since following a link must not move an entry
 * by itself. A name the type does not declare opens nothing and says nothing.
 */
export function TransitionActions({
    entryId,
    contentType,
    transitions,
    fields,
    viewer,
    requested,
}: {
    entryId: string;
    contentType: string;
    transitions: readonly StateTransition[];
    fields: readonly FieldDefinition[];
    viewer?: Viewer;
    requested?: string | null;
}) {
    const [asking, setAsking] = useState<StateTransition | null>(() => requestedTransition(transitions, requested));
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
                    viewer={viewer}
                    open
                    onOpenChange={(open) => {
                        if (open) return;
                        setAsking(null);
                        if (requested) forgetRequestedTransition();
                    }}
                />
            )}
        </>
    );
}

/** What the dialog's field names, and so its element ids, start with. */
export const TRANSITION_ID_PREFIX = 'transition-';

/** Asks for the fields a transition takes, then makes the move with their values. */
export function TransitionDialog({
    entryId,
    contentType,
    transition,
    fields,
    viewer,
    open,
    onOpenChange,
}: {
    entryId: string;
    contentType: string;
    transition: StateTransition;
    fields: readonly FieldDefinition[];
    viewer?: Viewer;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [refusal, setRefusal] = useState<string | null>(null);
    const move = useTransitionContent();

    const asked = transitionFields(transition, fields);
    const missing = missingTransitionFields(asked, values);

    // The entry's own form stays on the page under this dialog, and every control takes its id from
    // the field name, so the same names here would give two inputs one id and a label could point
    // at the wrong one. The dialog's form runs on prefixed names, mapped back to the real ones on
    // the way in and out. The editor a field gets by its name is fixed first, while the name is
    // still the real one. The form marks what the move needs, which is not what the field needs on
    // an ordinary save.
    const formFields = asked.map((a) => ({
        ...a.field,
        name: `${TRANSITION_ID_PREFIX}${a.field.name}`,
        isRequired: a.required,
        editor:
            chosenEditor(a.field, {
                isBlocks: isBlocksField,
                isMenu: (name) => isMenuItemsField(contentType, name),
            }) ?? null,
    }));
    const formValues = Object.fromEntries(
        Object.entries(values).map(([name, value]) => [`${TRANSITION_ID_PREFIX}${name}`, value]),
    );

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
                        Moves the entry from {transition.from} to {transition.to}.
                        {formFields.length > 0 && ' These values are saved with the move.'}
                    </DialogDescription>
                </DialogHeader>

                {formFields.length > 0 && (
                    <DynamicForm
                        fields={formFields}
                        values={formValues}
                        onChange={(next) => {
                            setRefusal(null);
                            setValues(
                                Object.fromEntries(
                                    Object.entries(next).map(([name, value]) => [
                                        name.slice(TRANSITION_ID_PREFIX.length),
                                        value,
                                    ]),
                                ),
                            );
                        }}
                        contentType={contentType}
                        viewer={viewer}
                    />
                )}

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
