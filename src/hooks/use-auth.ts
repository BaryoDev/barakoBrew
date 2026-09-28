'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { accessTokenExpired, api, ensureSession, refreshSession, subscribeToAuth, tokenStore } from '@/lib/api';

interface LoginResponse {
    token: string;
    expiry: string;
    refreshToken: string;
    refreshTokenExpiry: string;
    /** True when the password was right but the account needs a second factor. No tokens are issued. */
    requiresMfa?: boolean;
    /** Short-lived grant to complete the second step at /api/auth/mfa/verify. */
    mfaChallengeToken?: string;
    /** True when the device needs email approval instead (a separate second step). */
    requiresDeviceApproval?: boolean;
    message?: string;
    email?: string;
}

export interface SessionUser {
    userId?: string;
    username?: string;
    roles: string[];
}

function decodeSession(token: string | null): SessionUser | null {
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        const roleClaim = payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? payload.role;
        return {
            userId: payload.UserId,
            username: payload.Username,
            roles: Array.isArray(roleClaim) ? roleClaim : roleClaim ? [roleClaim] : [],
        };
    } catch {
        return null;
    }
}

const emptySubscribe = () => () => {};

/**
 * Asks the server to revoke this browser's session, and says whether it did.
 *
 * The logout call is authorised by the access token, which lives 15 minutes and is absent after a
 * reload. Sent with an expired token or none, it is refused and revokes nothing, while the refresh
 * cookie stays good for a week. So a token that is missing or expired is refreshed from the cookie
 * first, and a 401 on a token that looked live gets the same treatment. One refresh at most: if the
 * server still refuses, the answer is "not confirmed", not another round.
 */
async function revokeOnServer(): Promise<boolean> {
    let refreshed = false;
    const current = tokenStore.token;
    if (!current || accessTokenExpired(current)) {
        refreshed = true;
        if (!(await refreshSession())) return false;
    }
    try {
        await api.post('/api/auth/logout');
        return true;
    } catch (error) {
        if (refreshed || !isAxiosError(error) || error.response?.status !== 401) return false;
    }
    if (!(await refreshSession())) return false;
    try {
        await api.post('/api/auth/logout');
        return true;
    } catch {
        return false;
    }
}

export function useAuth() {
    const router = useRouter();
    const queryClient = useQueryClient();

    // False during SSR and hydration, true after — replaces a mount effect.
    const hydrated = useSyncExternalStore(
        emptySubscribe,
        () => true,
        () => false
    );

    // The access token is in memory, so a reload starts with none and the refresh cookie is what
    // carries the session. Until that one silent refresh has settled we do not know whether there
    // is a session, and treating "no token yet" as "signed out" would redirect to the login page on
    // every reload.
    const [bootstrapped, setBootstrapped] = useState(false);
    useEffect(() => {
        let cancelled = false;
        ensureSession().finally(() => {
            if (!cancelled) setBootstrapped(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    const token = useSyncExternalStore(
        subscribeToAuth,
        () => tokenStore.token,
        () => null
    );

    const user = useMemo(() => decodeSession(token), [token]);
    const isLoading = !hydrated || !bootstrapped;

    const logout = useCallback(async () => {
        const revoked = await revokeOnServer();
        tokenStore.clear();
        if (!revoked) {
            toast.error('Sign-out could not be confirmed with the server', {
                description:
                    'This tab is signed out, but the session may still be active in this browser. Sign in and sign out again, or clear this site\'s cookies.',
            });
        }
        // Everything cached was fetched as the account that just left. Dropping the token stops new
        // requests, and does nothing about answers already held: the next account signing in to this
        // tab reads the previous one's lists, counts and names from cache until each goes stale.
        // Switching tenant already invalidates every query for the same reason; signing out is the
        // larger version of that and was doing nothing.
        queryClient.clear();
        router.push('/login');
    }, [router, queryClient]);

    const requireAuth = useCallback(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [isLoading, user, router]);

    return {
        isAuthenticated: !!user,
        isLoading,
        user,
        logout,
        requireAuth,
    };
}

export function useLogin() {
    return useMutation({
        mutationFn: async (credentials: { username: string; password: string }) => {
            const { data } = await api.post<LoginResponse>('/api/auth/login', credentials);
            // A second-factor challenge is a successful response that carries NO tokens. Storing the
            // empty string here would look like a session and lock the user out of the UI, so only
            // persist when a real token came back; the caller drives the second step.
            if (data.token) {
                tokenStore.set(data.token);
            }
            return data;
        },
    });
}

/**
 * Completes a device approval: the emailed code, in exchange for tokens.
 *
 * The server answered `requiresDeviceApproval` and emailed a code, and the admin had nowhere to put
 * it, so turning on DeviceTrust__Enforce locked every administrator out of their own instance with
 * no way back in. The quickstart advertises that setting.
 *
 * It can chain: a correct email code on an account with MFA enabled returns `requiresMfa` and a
 * challenge token rather than a session, because possession of a mailbox is a first factor and
 * cannot stand in for the enrolled second one.
 */
export function useVerifyDeviceCode() {
    return useMutation({
        mutationFn: async (input: { email: string; code: string }) => {
            const { data } = await api.post<LoginResponse>('/api/auth/otp/verify', input);
            // No tokens when a second factor is still owed; the caller moves to the MFA step.
            if (data.token) tokenStore.set(data.token);
            return data;
        },
    });
}

/**
 * Asks the server to email a 6-digit sign-in code.
 *
 * Keyed on the email address, not the username: `POST /api/auth/otp/request` looks the account up
 * by email, and so does the verify half. That is why the button opens a field of its own rather
 * than reusing whatever is in the username box.
 *
 * The endpoint answers 200 with the same message whether or not the address is registered, on
 * purpose, so an unauthenticated caller cannot probe which accounts exist. Nothing here may report
 * more than it did.
 */
export function useRequestSignInCode() {
    return useMutation({
        mutationFn: async (input: { email: string }) => {
            const { data } = await api.post<{ message: string }>('/api/auth/otp/request', input);
            return data;
        },
    });
}

/** Completes a two-step sign-in: challenge token + a TOTP or recovery code, in exchange for tokens. */
export function useVerifyMfa() {
    return useMutation({
        mutationFn: async (input: { challengeToken: string; code: string }) => {
            const { data } = await api.post<LoginResponse>('/api/auth/mfa/verify', input);
            tokenStore.set(data.token);
            return data;
        },
    });
}
