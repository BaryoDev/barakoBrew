'use client';

import { useQuery } from '@tanstack/react-query';
import { api, getApiUrl } from '@/lib/api';

/**
 * Which external sign-in buttons this deployment can actually complete.
 *
 * `GET /api/auth/providers` only exists when BarakoCMS.ExternalAuth is installed, and it answers
 * false for a provider whose client id is unset even then. Rendering the buttons unconditionally
 * put a dead control on every deployment without the module, which is the default one.
 *
 * Anything other than a well-formed answer means no buttons. A 404 (module absent), a 500, a
 * network failure and an unreachable API are all the same fact from here: nothing on this screen
 * can finish an external sign-in, so nothing on this screen should offer one.
 */
export type SocialProvider = 'facebook' | 'google' | 'linkedin' | 'github';

/** One OpenID Connect provider configured under `Oidc:Providers`. */
export interface OidcProvider {
    name: string;
    displayName: string;
}

export interface AuthProviders {
    facebook: boolean;
    google: boolean;
    linkedin: boolean;
    github: boolean;
    /** Absent before ExternalAuth 4.4.0, which reads as none. */
    oidc: OidcProvider[];
}

const NONE: AuthProviders = { facebook: false, google: false, linkedin: false, github: false, oidc: [] };

/** The API's own rule for a provider name, which is also the route segment. */
const OIDC_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * The `oidc` array, keeping only entries that could form a start URL.
 *
 * The name goes into a path, so an entry that breaks the API's own naming rule is dropped rather
 * than escaped into a route the API would answer 404 to.
 */
export function readOidcProviders(value: unknown): OidcProvider[] {
    if (!Array.isArray(value)) return [];
    const providers: OidcProvider[] = [];
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const { name, displayName } = item as { name?: unknown; displayName?: unknown };
        if (typeof name !== 'string' || !OIDC_NAME.test(name)) continue;
        const label = typeof displayName === 'string' && displayName.trim().length > 0 ? displayName.trim() : name;
        providers.push({ name, displayName: label });
    }
    return providers;
}

export function useAuthProviders() {
    return useQuery({
        queryKey: ['auth', 'providers'],
        queryFn: async (): Promise<AuthProviders> => {
            try {
                const { data } = await api.get<Partial<Record<keyof AuthProviders, unknown>>>('/api/auth/providers');
                return {
                    facebook: data?.facebook === true,
                    google: data?.google === true,
                    linkedin: data?.linkedin === true,
                    github: data?.github === true,
                    oidc: readOidcProviders(data?.oidc),
                };
            } catch {
                return NONE;
            }
        },
        // Which providers a deployment configured changes on restart, not while a login page is
        // open, and this runs before there is a session to invalidate anything.
        staleTime: Infinity,
        // The catch above already turned every failure into NONE, so a retry would only re-run a
        // request whose answer is already decided.
        retry: false,
    });
}

/**
 * Where the browser goes to start an external sign-in.
 *
 * A full navigation, not an XHR: the flow is an OAuth redirect that sets cookies on the API origin
 * and comes back to the callback, so it has to leave the SPA. The path is built from the same base
 * the axios client uses, because the admin picks its API at runtime from `window._env_`.
 */
export function externalSignInUrl(provider: SocialProvider): string {
    return `${getApiUrl()}/api/auth/${provider}/start`;
}

/** The same, for an OpenID Connect provider. Its callback lands where the four above land. */
export function oidcSignInUrl(name: string): string {
    return `${getApiUrl()}/api/auth/oidc/${encodeURIComponent(name)}/start`;
}
