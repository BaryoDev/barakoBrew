'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from './field-error';
import { SubmitButton } from './parts';

export const CODE_LENGTH = 6;

/** Digits only, at most six. What the field keeps of whatever was typed or pasted. */
export function digitsOnly(value: string): string {
    return value.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

export type CodeKind = 'device' | 'code' | 'totp';

export interface CodeStepProps {
    /**
     * `device` is the server refusing an unrecognised browser after a correct password, `code` is the
     * person choosing an emailed code instead of a password, `totp` is the authenticator. One layout,
     * different copy, because they are different events to the person reading them.
     */
    kind: CodeKind;
    /** Where the code was mailed. Not used by `totp`. */
    email?: string;
    pending: boolean;
    /** The wrong-code message, shown inline under the field. */
    error: string | null;
    onSubmit: (code: string) => void;
    onBack: () => void;
    /** Email variants only. */
    onResend?: () => void;
    resending?: boolean;
    /** The swap row: Use authenticator / Email me a code. Omitted when the other route is not open. */
    onSwap?: () => void;
}

const COPY: Record<CodeKind, { title: string; label: string }> = {
    device: { title: 'Check your email', label: 'Device approval code' },
    code: { title: 'Check your email', label: 'Sign-in code' },
    totp: { title: 'Enter your authentication code', label: 'Authentication code' },
};

/**
 * The 6-digit step. Mono, 26px, digits only, Continue off until all six are in.
 *
 * A recovery code is not six digits, so the authenticator variant can switch the field to free text
 * for one. That is the "Use a recovery code" link, which stands in for "Send a new code" there.
 */
export function CodeStep({
    kind,
    email,
    pending,
    error,
    onSubmit,
    onBack,
    onResend,
    resending,
    onSwap,
}: CodeStepProps) {
    const errorId = useId();
    const [code, setCode] = useState('');
    const [recovery, setRecovery] = useState(false);
    const totp = kind === 'totp';
    const { title, label } = COPY[kind];
    const ready = recovery ? code.trim().length > 0 : code.length === CODE_LENGTH;

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (!ready) return;
                onSubmit(recovery ? code.trim() : code);
                setCode('');
            }}
            className="flex flex-col gap-4"
        >
            <div>
                <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">
                    {recovery ? 'Enter a recovery code' : title}
                </h2>
                <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
                    {totp ? (
                        recovery ? (
                            'Use one of the recovery codes you saved when you set up two-factor sign-in.'
                        ) : (
                            'From your authenticator app. Codes rotate every 30 seconds.'
                        )
                    ) : (
                        <>
                            We sent a 6-digit code to <span className="font-mono">{email}</span>
                            {kind === 'code' ? ' if that address is registered' : ''}.
                        </>
                    )}
                </p>
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="otp-code" className="text-secondary-foreground text-[12.5px] font-bold">
                    {recovery ? 'Recovery code' : label}
                </Label>
                <Input
                    id="otp-code"
                    // one-time-code lets password managers and iOS autofill offer the code directly.
                    autoComplete="one-time-code"
                    inputMode={recovery ? 'text' : 'numeric'}
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- this step appears after the user's own action, so focus follows them rather than seizing the page on load.
                    autoFocus
                    required
                    maxLength={recovery ? undefined : CODE_LENGTH}
                    placeholder={recovery ? '' : '000000'}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    value={code}
                    onChange={(e) => setCode(recovery ? e.target.value : digitsOnly(e.target.value))}
                    className="bg-background h-14 text-center font-mono text-[26px] tracking-[0.3em] tabular-nums md:text-[26px]"
                />
                {error ? <FieldError id={errorId} message={error} /> : null}
            </div>

            <SubmitButton pending={pending} pendingLabel="Verifying…" disabled={!ready}>
                Continue
            </SubmitButton>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
                {totp ? (
                    <LinkButton
                        onClick={() => {
                            setRecovery((v) => !v);
                            setCode('');
                        }}
                    >
                        {recovery ? 'Use the authenticator code' : 'Use a recovery code'}
                    </LinkButton>
                ) : (
                    <LinkButton onClick={onResend} disabled={resending || !onResend}>
                        {resending ? 'Sending…' : 'Send a new code'}
                    </LinkButton>
                )}
                {onSwap ? <LinkButton onClick={onSwap}>{totp ? 'Email me a code' : 'Use authenticator'}</LinkButton> : null}
            </div>

            {!totp && (
                <p className="text-[var(--faint)] bg-secondary rounded-lg px-3 py-2.5 text-xs leading-snug">
                    Entering the code trusts this browser for 30 days, so the next sign-in from it
                    skips this step. You can see and remove trusted devices in Settings.
                </p>
            )}

            <Button type="button" variant="ghost" className="h-10 w-full" onClick={onBack}>
                Not you? Go back
            </Button>
        </form>
    );
}

function LinkButton({
    onClick,
    disabled,
    children,
}: {
    onClick?: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="text-accent-foreground font-semibold hover:underline disabled:opacity-50"
        >
            {children}
        </button>
    );
}
