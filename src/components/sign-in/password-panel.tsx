'use client';

import { useId, useState } from 'react';
import { useLogin } from '@/hooks/use-auth';
import { apiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconArrowRight } from '@/components/icons';
import { FieldError } from './field-error';
import { FIELD, SubmitButton } from './parts';
import type { SignInPanelProps } from './types';

export function PasswordPanel({ flow, form }: SignInPanelProps) {
    const { username, password, setUsername, setPassword } = form;
    const login = useLogin();
    const errorId = useId();
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        login.mutate(
            { username, password },
            {
                onSuccess: (data) => {
                    if (data.requiresMfa && data.mfaChallengeToken) {
                        flow.needsMfa(data.mfaChallengeToken);
                        return;
                    }
                    if (data.requiresDeviceApproval) {
                        // The server sends the address it mailed. Without it there is nothing to verify
                        // against, so stay on the password form rather than show a step that cannot succeed.
                        if (!data.email) {
                            setError('This device needs approval, but the server did not say where the code was sent.');
                            return;
                        }
                        flow.needsDeviceCode(data.email, data.message);
                        return;
                    }
                    flow.signedIn();
                },
                onError: (err) => setError(apiErrorMessage(err, 'Wrong username or password.')),
            }
        );
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="username" className="text-secondary-foreground text-[12.5px] font-bold">
                    Username
                </Label>
                <Input
                    id="username"
                    autoComplete="username"
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- a sign-in page has one purpose and this is its first field, so the disorientation the rule guards against does not apply.
                    autoFocus
                    required
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={FIELD}
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                    <Label htmlFor="password" className="text-secondary-foreground text-[12.5px] font-bold">
                        Password
                    </Label>
                    {/* There is no password reset in this product (#416), so this goes to the route
                        back in that exists: a code to the address on the account. Only drawn when
                        the server lists that route. */}
                    {flow.availableMethods.includes('email-code') && (
                        <button
                            type="button"
                            onClick={() => flow.openMethod('email-code')}
                            className="text-accent-foreground text-[12.5px] font-semibold hover:underline"
                        >
                            Forgot it?
                        </button>
                    )}
                </div>
                <div className="relative">
                    <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId : undefined}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${FIELD} pr-16`}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPassword((v) => !v)}
                        className="text-muted-foreground absolute top-[5px] right-[5px] h-8 px-2.5 text-xs font-bold"
                    >
                        {showPassword ? 'Hide' : 'Show'}
                        <span className="sr-only"> password</span>
                    </Button>
                </div>
                {error ? (
                    <FieldError
                        id={errorId}
                        message={error}
                        hint="After 5 failed tries the account locks for 15 minutes."
                    />
                ) : null}
            </div>

            {/* A note, not a control: the server trusts the browser on every verified emailed code
                and neither request carries a flag to opt out. */}
            <p className="text-[var(--faint)] text-xs leading-snug">
                Entering the emailed code trusts this browser for 30 days.
            </p>

            <SubmitButton pending={login.isPending} pendingLabel="Signing in…">
                Sign in
                <IconArrowRight className="size-3.5" />
            </SubmitButton>
        </form>
    );
}
