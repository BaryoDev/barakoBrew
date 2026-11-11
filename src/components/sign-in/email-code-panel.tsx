'use client';

import { useId, useState } from 'react';
import { useRequestSignInCode } from '@/hooks/use-auth';
import { apiErrorMessage } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from './field-error';
import { FIELD, SubmitButton } from './parts';
import type { SignInPanelProps } from './types';

/** Passwordless: the address, then the same 6-digit step the new-device check uses. */
export function EmailCodePanel({ flow }: SignInPanelProps) {
    const requestCode = useRequestSignInCode();
    const errorId = useId();
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const address = email.trim();
        requestCode.mutate(
            { email: address },
            {
                // The endpoint answers identically whether or not the address is registered, so the
                // message is the server's own rather than a claim that an email was sent.
                onSuccess: (data) => flow.codeRequested(address, data.message),
                onError: (err) => setError(apiErrorMessage(err, 'Could not request a sign-in code.')),
            }
        );
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-secondary-foreground text-[12.5px] font-bold">
                    Email address
                </Label>
                <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={FIELD}
                />
                <p className="text-[var(--faint)] text-xs">
                    The address on your account, not your username. We answer the same way whether or
                    not it is registered.
                </p>
                {error ? <FieldError id={errorId} message={error} /> : null}
            </div>
            <SubmitButton pending={requestCode.isPending} pendingLabel="Sending…">
                Send the code
            </SubmitButton>
        </form>
    );
}
