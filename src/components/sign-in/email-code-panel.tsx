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
export function EmailCodePanel({ flow, form, autoFocusField }: SignInPanelProps) {
    const { email, setEmail } = form;
    const requestCode = useRequestSignInCode();
    const errorId = useId();
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
            {error ? <FieldError id={errorId} message={error} /> : null}
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-secondary-foreground text-[12.5px] font-bold">
                    Email address
                </Label>
                <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- only set when the person followed "Forgot it?" here, so focus follows their own action and does not drop to the page.
                    autoFocus={autoFocusField}
                    required
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={FIELD}
                />
            </div>
            <p className="text-muted-foreground text-[13.5px] leading-relaxed">
                No password needed. We email a 6-digit code that works once. If you have an
                authenticator app enrolled, you can use that instead on the next step.
            </p>
            <SubmitButton pending={requestCode.isPending} pendingLabel="Sending…">
                Email me a code
            </SubmitButton>
        </form>
    );
}
