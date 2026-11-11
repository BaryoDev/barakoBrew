'use client';

import { useId, useState } from 'react';
import { useLogin } from '@/hooks/use-auth';
import { apiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconArrowRight } from '@/components/icons';
import { FieldError } from './field-error';
import { FIELD, SubmitButton } from './parts';
import type { SignInPanelProps } from './types';

export function PasswordPanel({ flow }: SignInPanelProps) {
    const login = useLogin();
    const errorId = useId();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    // Drawn as the design has it, default on. The server decides trust itself: it records the
    // device when the emailed code is verified, and the login and verify requests carry no flag to
    // opt out, so this is the explanation of that and not a request parameter.
    const [trust, setTrust] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        login.mutate(
            { username, password },
            {
                onSuccess: (data) => {
                    if (data.requiresMfa && data.mfaChallengeToken) {
                        setPassword('');
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
                        setPassword('');
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
                        back in that exists: a code to the address on the account. */}
                    <button
                        type="button"
                        onClick={() => flow.openMethod('email-code')}
                        className="text-accent-foreground text-[12.5px] font-semibold hover:underline"
                    >
                        Forgot it?
                    </button>
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

            <div className="flex items-start gap-3 rounded-xl border p-3.5">
                <Checkbox
                    id="trust-device"
                    checked={trust}
                    onCheckedChange={(v) => setTrust(v === true)}
                    className="mt-0.5"
                />
                <div className="flex flex-col gap-0.5">
                    <Label htmlFor="trust-device" className="text-[13.5px] font-bold">
                        Trust this device for 30 days
                    </Label>
                    <p className="text-[var(--faint)] text-xs leading-snug">
                        Skips the emailed code on this browser next time. Leave it off on a shared
                        computer.
                    </p>
                </div>
            </div>

            <SubmitButton pending={login.isPending} pendingLabel="Signing in…">
                Sign in
                <IconArrowRight className="size-3.5" />
            </SubmitButton>
        </form>
    );
}
