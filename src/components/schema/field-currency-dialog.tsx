'use client';

import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useSetFieldCurrency } from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import { currencyProblem } from '@/lib/field-presentation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { FieldDefinition } from '@/types/schema';

/**
 * Declares, changes or clears the currency of a money field on a type that already exists.
 *
 * No entry is rewritten. Entries holding an amount the new scale refuses, or amounts stored under
 * another code, make the API answer 409 with how many; that message is shown as it is, with a
 * button that resends with `force`, as the options dialog does.
 */
export function FieldCurrencyDialog({
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
    const [currency, setCurrency] = useState(field.currency ?? '');
    const [scale, setScale] = useState(field.scale === null || field.scale === undefined ? '' : String(field.scale));
    const [refusal, setRefusal] = useState<string | null>(null);
    const setFieldCurrency = useSetFieldCurrency(typeName, field.name);
    const issue = currencyProblem(currency, scale);

    const send = (force: boolean) =>
        setFieldCurrency.mutate(
            { currency: currency || null, scale: scale === '' ? null : Number(scale), force },
            {
                onSuccess: (result) => {
                    const notFitting = result?.entriesNotFitting ?? 0;
                    toast.success(
                        notFitting > 0
                            ? `Currency saved. ${notFitting} ${notFitting === 1 ? 'entry holds' : 'entries hold'} an amount that must be corrected on its next save.`
                            : 'Currency saved',
                    );
                    onOpenChange(false);
                },
                onError: (error) => {
                    const message = apiErrorMessage(error, 'The currency could not be saved.');
                    if (axios.isAxiosError(error) && error.response?.status === 409) setRefusal(message);
                    else toast.error(message);
                },
            },
        );

    const change = (apply: () => void) => {
        // A confirmation was for what the API saw, not for this.
        setRefusal(null);
        apply();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Currency for {field.displayName}</DialogTitle>
                    <DialogDescription>
                        Every amount in this field is in one currency. Nothing is converted or rounded, and
                        no entry is rewritten.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="currency-code">Currency</Label>
                        <Input
                            id="currency-code"
                            value={currency}
                            placeholder="USD"
                            maxLength={3}
                            className="font-mono"
                            onChange={(e) => change(() => setCurrency(e.target.value.toUpperCase()))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="currency-scale">Decimal places</Label>
                        <Input
                            id="currency-scale"
                            type="number"
                            min={0}
                            max={8}
                            step={1}
                            value={scale}
                            placeholder="The currency's own"
                            onChange={(e) => change(() => setScale(e.target.value))}
                        />
                    </div>
                </div>
                <p className="text-muted-foreground text-xs">Leave the currency empty for a plain number.</p>
                {issue && <p className="text-destructive text-xs">{issue}</p>}

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
                            disabled={setFieldCurrency.isPending}
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
                        disabled={!!issue || setFieldCurrency.isPending || refusal !== null}
                        onClick={() => send(false)}
                    >
                        {setFieldCurrency.isPending ? 'Saving...' : 'Save currency'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
