'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCompleteSocialSignIn, useVerifyMfa } from '@/hooks/use-auth';
import { apiErrorMessage, tenantOfToken } from '@/lib/api';
import { parseSocialFragment, type SocialFragment } from '@/lib/social-callback';
import { BrandBean } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Stage =
    | { kind: 'reading' }
    | { kind: 'signing-in' }
    | { kind: 'mfa'; challenge: string; club: string }
    | { kind: 'failed'; message: string };

const INCOMPLETE =
    'The sign-in link was incomplete or has already been used. Start the sign-in again from the sign-in page.';

/**
 * Where the API sends the browser after an external sign-in (a social provider or OpenID Connect).
 *
 * The fragment holds either the tokens or an MFA challenge. It is read once and wiped from the
 * address bar and from this history entry before anything else happens, so the back button, a
 * bookmark or a screenshot cannot carry it.
 */
export default function SocialCallbackPage() {
    const router = useRouter();
    const complete = useCompleteSocialSignIn();
    const verifyMfa = useVerifyMfa();
    const [stage, setStage] = useState<Stage>({ kind: 'reading' });
    const [code, setCode] = useState('');
    const [mfaError, setMfaError] = useState<string | null>(null);
    // React runs effects twice in development, and the second run would find the fragment already
    // cleared and report it missing.
    const read = useRef(false);

    // Everything this page does follows from the fragment, so it is decided in one place, once.
    const begin = (fragment: SocialFragment) => {
        if (fragment.kind === 'invalid') {
            setStage({ kind: 'failed', message: INCOMPLETE });
            return;
        }
        if (fragment.kind === 'mfa') {
            setStage({ kind: 'mfa', challenge: fragment.challenge, club: fragment.club });
            return;
        }

        setStage({ kind: 'signing-in' });
        complete.mutate(
            { refresh: fragment.refresh, tenant: tenantOfToken(fragment.token) ?? (fragment.club || null) },
            {
                onSuccess: () => router.replace('/'),
                onError: (error) => setStage({ kind: 'failed', message: apiErrorMessage(error, INCOMPLETE) }),
            },
        );
    };

    useEffect(() => {
        if (read.current) return;
        read.current = true;

        const fragment = parseSocialFragment(window.location.hash);
        window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);

        // After the effect, not inside it: the fragment is gone from the address bar first, and
        // the state change is not a synchronous set inside an effect.
        void Promise.resolve().then(() => begin(fragment));
        // Once, on arrival.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const submitMfa = (event: React.FormEvent) => {
        event.preventDefault();
        if (stage.kind !== 'mfa') return;
        verifyMfa.mutate(
            { challengeToken: stage.challenge, code: code.trim(), tenant: stage.club || undefined },
            {
                onSuccess: () => router.replace('/'),
                // The step stays, as on the sign-in page: a code from the wrong 30 seconds is the usual
                // reason. If the challenge itself has expired, the API's message says so.
                onError: (error) => {
                    setCode('');
                    setMfaError(apiErrorMessage(error, 'That code was not accepted. Try the current one.'));
                },
            },
        );
    };

    return (
        <div className="bg-background flex min-h-svh items-center justify-center p-8">
            <div className="w-full max-w-[340px]">
                <div className="flex flex-col items-center gap-3.5 text-center">
                    <BrandBean className="size-11" />
                    <h1 className="font-display text-2xl font-semibold tracking-[-0.03em]">
                        Sign in to barako<span className="text-primary">Brew</span>
                    </h1>
                </div>

                <div className="bg-card mt-7 flex flex-col gap-4 rounded-2xl border p-6">
                    {stage.kind === 'reading' || stage.kind === 'signing-in' ? (
                        <p role="status" className="text-muted-foreground text-center text-sm">
                            Finishing the sign-in...
                        </p>
                    ) : stage.kind === 'mfa' ? (
                        <form onSubmit={submitMfa} className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="social-mfa-code" className="text-[12.5px] font-bold">
                                    Authentication code
                                </Label>
                                <Input
                                    id="social-mfa-code"
                                    autoComplete="one-time-code"
                                    inputMode="numeric"
                                    required
                                    placeholder="123456"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className="h-[42px] font-mono tabular-nums"
                                />
                                <p className="text-xs text-[var(--faint)]">
                                    This account has two-step sign-in. Enter the code from your authenticator app,
                                    or a recovery code.
                                </p>
                            </div>
                            {mfaError && (
                                <p role="alert" className="text-destructive text-sm">
                                    {mfaError}
                                </p>
                            )}
                            <Button type="submit" disabled={verifyMfa.isPending} className="h-11 w-full font-bold">
                                {verifyMfa.isPending ? 'Verifying...' : 'Verify'}
                            </Button>
                        </form>
                    ) : (
                        <>
                            <p role="alert" className="text-sm">
                                {stage.message}
                            </p>
                            <Button asChild variant="outline" className="h-10 w-full">
                                <Link href="/login">Back to sign in</Link>
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
