'use client';

import { Button } from '@/components/ui/button';
import { IconExternalLink } from '@/components/icons';
import {
    externalSignInUrl,
    oidcSignInUrl,
    type AuthProviders,
    type SocialProvider,
} from '@/hooks/use-auth-providers';

const PROVIDER_LABELS: Record<SocialProvider, string> = {
    github: 'GitHub',
    google: 'Google',
    linkedin: 'LinkedIn',
    facebook: 'Facebook',
};

// Ordered, because the object key order of a JSON response is not a design decision. Google first,
// as the design has it, with GitHub beside it.
const MARKED: SocialProvider[] = ['google', 'github'];
const OTHER: SocialProvider[] = ['linkedin', 'facebook'];

/** The providers the deployment reports, so a screen with none draws nothing at all. */
export function hasProviders(providers: AuthProviders | undefined): boolean {
    if (!providers) return false;
    return [...MARKED, ...OTHER].some((p) => providers[p]) || providers.oidc.length > 0;
}

function GoogleMark() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden className="size-4">
            <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.05 5.05 0 0 1-2.19 3.31v2.75h3.55c2.08-1.91 3.28-4.73 3.28-8.09Z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.55-2.75c-.98.66-2.24 1.06-3.73 1.06-2.87 0-5.3-1.94-6.17-4.55H2.17v2.84A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.83 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.17a11 11 0 0 0 0 9.88l3.66-2.84Z" />
            <path fill="#EA4335" d="M12 5.35c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.17 7.06l3.66 2.84C6.7 7.29 9.13 5.35 12 5.35Z" />
        </svg>
    );
}

function GitHubMark() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
            <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
        </svg>
    );
}

const MARKS: Partial<Record<SocialProvider, () => React.ReactElement>> = {
    google: GoogleMark,
    github: GitHubMark,
};

const BUTTON =
    'text-secondary-foreground hover:border-primary hover:text-accent-foreground h-10 text-[13.5px] font-semibold';

/**
 * "or continue with", from GET /api/auth/providers.
 *
 * Rendered from what the server reports rather than unconditionally: the ExternalAuth module is
 * optional and a provider with no client id is off even when it is installed, so a hardcoded button
 * is dead on the default deployment. Each button is a full navigation to the API's own start URL,
 * because an OAuth redirect has to leave the SPA and come back through the callback.
 */
export function ProviderButtons({ providers }: { providers: AuthProviders | undefined }) {
    if (!providers || !hasProviders(providers)) return null;
    const marked = MARKED.filter((p) => providers[p]);
    const other = OTHER.filter((p) => providers[p]);

    return (
        <>
            <div className="flex items-center gap-3">
                <span className="bg-border h-px flex-1" />
                <span className="text-[var(--faint)] text-[11.5px] font-semibold">or continue with</span>
                <span className="bg-border h-px flex-1" />
            </div>
            <div className="flex flex-col gap-2">
                {marked.length > 0 && (
                    <div className={marked.length === 2 ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'}>
                        {marked.map((provider) => {
                            const Mark = MARKS[provider]!;
                            return (
                                <Button
                                    key={provider}
                                    type="button"
                                    variant="outline"
                                    aria-label={`Continue with ${PROVIDER_LABELS[provider]}`}
                                    onClick={() => {
                                        window.location.href = externalSignInUrl(provider);
                                    }}
                                    className={BUTTON}
                                >
                                    <Mark />
                                    {PROVIDER_LABELS[provider]}
                                </Button>
                            );
                        })}
                    </div>
                )}
                {other.map((provider) => (
                    <Button
                        key={provider}
                        type="button"
                        variant="outline"
                        onClick={() => {
                            window.location.href = externalSignInUrl(provider);
                        }}
                        className={BUTTON}
                    >
                        <IconExternalLink className="size-3.5" />
                        Continue with {PROVIDER_LABELS[provider]}
                    </Button>
                ))}
                {/* OpenID Connect providers, in the order the API lists them (by name). */}
                {providers.oidc.map((provider) => (
                    <Button
                        key={`oidc-${provider.name}`}
                        type="button"
                        variant="outline"
                        onClick={() => {
                            window.location.href = oidcSignInUrl(provider.name);
                        }}
                        className={BUTTON}
                    >
                        <IconExternalLink className="size-3.5" />
                        Continue with {provider.displayName}
                    </Button>
                ))}
            </div>
        </>
    );
}
