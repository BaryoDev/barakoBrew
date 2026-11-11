'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth, useRequestSignInCode, useVerifyDeviceCode, useVerifyMfa } from '@/hooks/use-auth';
import { useAuthProviders } from '@/hooks/use-auth-providers';
import { useInstanceReachability } from '@/hooks/use-instance-reachability';
import { useSignInMethods } from '@/hooks/use-sign-in-methods';
import { apiErrorMessage, getApiUrl } from '@/lib/api';
import { signInErrorFromQuery } from '@/lib/social-callback';
import { tabsFor } from '@/lib/sign-in-methods';
import { BrandBean, BrandWordmark } from '@/components/brand';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrandPanel } from '@/components/sign-in/brand-panel';
import { CodeStep } from '@/components/sign-in/code-step';
import { ProviderButtons, hasProviders } from '@/components/sign-in/provider-buttons';
import { SIGN_IN_METHODS } from '@/components/sign-in/registry';
import { ThemeSwitch } from '@/components/sign-in/theme-switch';
import type { SignInFlow } from '@/components/sign-in/types';

const emptySubscribe = () => () => {};

function apiHostSnapshot(): string | null {
  try {
    return new URL(getApiUrl()).host;
  } catch {
    return null;
  }
}

/** What an external sign-in that failed left in `?fberror=`. Null on the server, like the host. */
function signInErrorSnapshot(): string | null {
  return signInErrorFromQuery(window.location.search);
}

/**
 * Which step the sign-in is on.
 *
 * `form` is the method tabs. `device` and `code` both finish at POST /api/auth/otp/verify and differ
 * only in how they were reached: `device` is the server refusing an unrecognised browser after a
 * correct password, `code` is the user choosing email instead of a password. `mfa` is the
 * authenticator. All three are drawn by one CodeStep, with copy that follows the step.
 */
type Step = 'form' | 'device' | 'code' | 'mfa';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const verifyMfa = useVerifyMfa();
  const verifyDevice = useVerifyDeviceCode();
  const requestCode = useRequestSignInCode();
  const { data: providers } = useAuthProviders();
  const { data: listed } = useSignInMethods();
  const { data: reachability } = useInstanceReachability();

  const [step, setStep] = useState<Step>('form');
  const [method, setMethod] = useState('password');
  // Set when the password was accepted but a second factor is required. Holds the short-lived
  // challenge, so the password never has to be kept around or re-sent.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  // The address /api/auth/otp/verify identifies the account by. On the device path the server says
  // where it mailed; on the email path the user typed it.
  const [email, setEmail] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  // The API host, so an operator can see which instance this page is signing into. Read on the
  // client only: getApiUrl() reads window._env_, which the server does not have, and a value that
  // differs between the two renders is a hydration mismatch. The server snapshot is null, matching
  // what layout.tsx already does for the session token.
  const apiHost = useSyncExternalStore(emptySubscribe, apiHostSnapshot, () => null);
  const externalError = useSyncExternalStore(emptySubscribe, signInErrorSnapshot, () => null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/');
  }, [isLoading, isAuthenticated, router]);

  // Until the list arrives only the password form is drawn, so the tabs do not flicker in and out.
  const tabs = tabsFor(listed ?? ['password'], SIGN_IN_METHODS);
  const activeTab = tabs.find((t) => t.id === method) ?? tabs[0];

  const goTo = (next: Step) => {
    setCodeError(null);
    setStep(next);
  };

  const startOver = () => {
    goTo('form');
    setChallengeToken(null);
    setEmail('');
  };

  const flow: SignInFlow = {
    needsDeviceCode(address, message) {
      setEmail(address);
      goTo('device');
      toast.info(message ?? 'Check your email for a device approval code.');
    },
    codeRequested(address, message) {
      setEmail(address);
      goTo('code');
      // The endpoint answers identically whether or not the address is registered, so this
      // repeats what it said rather than claiming an email was sent.
      toast.info(message ?? 'If that email is registered, a sign-in code has been sent.');
    },
    needsMfa(token) {
      setChallengeToken(token);
      goTo('mfa');
    },
    signedIn: () => router.push('/'),
    openMethod: (id) => setMethod(id),
  };

  const handleMfa = (code: string) => {
    if (!challengeToken) return;
    setCodeError(null);
    verifyMfa.mutate(
      { challengeToken, code },
      {
        onSuccess: () => router.push('/'),
        onError: (error) =>
          setCodeError(
            apiErrorMessage(error, 'That code was not accepted. Codes rotate every 30 seconds, try the current one.')
          ),
      }
    );
  };

  const handleEmailCode = (code: string) => {
    if (!email) return;
    setCodeError(null);
    verifyDevice.mutate(
      { email, code },
      {
        onSuccess: (data) => {
          // A correct email code on an MFA account owes a second factor and issues no tokens, so
          // this hands off to the existing challenge step rather than treating it as signed in.
          if (data.requiresMfa && data.mfaChallengeToken) {
            flow.needsMfa(data.mfaChallengeToken);
            return;
          }
          router.push('/');
        },
        onError: (error) =>
          setCodeError(apiErrorMessage(error, 'That code was not accepted. Check the most recent email.')),
      }
    );
  };

  const handleResend = () => {
    if (!email) return;
    requestCode.mutate(
      { email },
      {
        onSuccess: (data) => toast.info(data.message ?? 'If that email is registered, a new code has been sent.'),
        onError: (error) => toast.error(apiErrorMessage(error, 'Could not send a new code.')),
      }
    );
  };

  // The swap row. "Use authenticator" is only offered when a challenge is already held, and "Email
  // me a code" only when the address is known: the server gives neither a way to hop factors from
  // nothing, so a link without its prerequisite would be a dead end.
  const swapToEmail =
    step === 'mfa' && email
      ? () => {
          handleResend();
          goTo('code');
        }
      : undefined;
  const swapToAuthenticator = step === 'code' && challengeToken ? () => goTo('mfa') : undefined;

  const showProviders = hasProviders(providers);

  return (
    <div className="bg-background flex min-h-svh">
      <BrandPanel host={apiHost} reachability={reachability} />

      <main className="relative flex min-h-svh flex-1 flex-col items-center justify-center overflow-hidden px-6 py-10">
        <div className="w-full max-w-[400px]">
          {/* Below 900px the panel is gone, so the wordmark and the host it would have carried sit here. */}
          <div className="mb-8 flex items-center gap-3 min-[900px]:hidden">
            <BrandBean className="size-9" />
            <div>
              <BrandWordmark />
              <p className="text-muted-foreground font-mono text-xs tabular-nums">{apiHost ?? ' '}</p>
            </div>
          </div>

          {step === 'form' ? (
            <>
              <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em]">Welcome back</h1>
              <p className="text-muted-foreground mt-1.5 text-[13.5px] leading-snug">
                Use the account you have on this instance. Your role here is set by its Owner.
              </p>

              {externalError && (
                <p
                  role="alert"
                  className="border-destructive/40 text-destructive mt-5 rounded-xl border px-4 py-3 text-[13px]"
                >
                  {externalError}
                </p>
              )}

              <div className="mt-6 flex flex-col gap-4">
                {tabs.length === 0 ? (
                  <p className="text-muted-foreground rounded-xl border p-4 text-[13px]">
                    This instance does not list a sign-in method this console can draw.
                  </p>
                ) : tabs.length === 1 ? (
                  <activeTab.Panel flow={flow} />
                ) : (
                  <Tabs value={activeTab.id} onValueChange={setMethod}>
                    <TabsList className="bg-secondary h-11 w-full">
                      {tabs.map((tab) => (
                        <TabsTrigger key={tab.id} value={tab.id} className="text-[13px] font-bold whitespace-nowrap">
                          <tab.icon className="size-3.5" />
                          {tab.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <TabsContent value={activeTab.id} className="mt-3">
                      <activeTab.Panel flow={flow} />
                    </TabsContent>
                  </Tabs>
                )}

                <ProviderButtons providers={providers} />
              </div>

              <p className="mt-5 text-xs leading-relaxed text-[var(--faint)]">
                {showProviders
                  ? 'Signing in with a provider matches the verified email on your account. '
                  : ''}
                Need an account? Ask an Owner of this instance to invite you. Five failed attempts
                lock the account for 15 minutes.
              </p>
            </>
          ) : (
            <CodeStep
              key={step}
              kind={step === 'mfa' ? 'totp' : step}
              email={email}
              pending={step === 'mfa' ? verifyMfa.isPending : verifyDevice.isPending}
              error={codeError}
              onSubmit={step === 'mfa' ? handleMfa : handleEmailCode}
              onBack={startOver}
              onResend={handleResend}
              resending={requestCode.isPending}
              onSwap={step === 'mfa' ? swapToEmail : swapToAuthenticator}
            />
          )}
        </div>

        <div className="absolute right-6 bottom-6">
          <ThemeSwitch />
        </div>
      </main>
    </div>
  );
}
