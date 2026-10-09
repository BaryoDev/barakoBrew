'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, isNotFound, subscribeToAuth, tenantOfToken, tokenStore } from '@/lib/api';
import { accessFrom, type Access, type Me } from '@/lib/access';
import { useAuth } from '@/hooks/use-auth';

function isMe(value: unknown): value is Me {
    const me = value as Me | null;
    return (
        !!me &&
        Array.isArray(me.capabilities) &&
        me.capabilities.every((c) => typeof c === 'string') &&
        Array.isArray(me.roles) &&
        me.roles.every((r) => !!r && typeof r.id === 'string' && typeof r.name === 'string')
    );
}

/**
 * `GET /api/me`, or null when this API has no such route (before 4.7 it answers 404) or answered
 * with something that is not the shape. Null means "fall back to role names", never "holds nothing".
 */
async function fetchMe(): Promise<Me | null> {
    try {
        const { data } = await api.get<Me>('/api/me');
        return isMe(data) ? data : null;
    } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
    }
}

const noTokenOnServer = () => null;

/** How long an answer is trusted with no new token: the access token's own lifetime. */
export const ME_STALE_MS = 15 * 60 * 1000;

/**
 * Which token this is, without keeping the token: its `jti`, else its expiry. A refresh mints a new
 * one, so the answer is read again whenever the session is renewed, and a capability revoked in the
 * meantime stops being offered within one token lifetime.
 */
function tokenStamp(token: string | null): string | null {
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        const stamp = payload.jti ?? payload.exp;
        return stamp === undefined ? null : String(stamp);
    } catch {
        return null;
    }
}

/**
 * What the signed-in caller may do, read once per token.
 *
 * The key holds the user, the tenant the token was minted for and which token it is, so switching
 * tenants reads again and so does each refresh, about every fifteen minutes. Within a tenant the last
 * answer stays in use while the next one loads, so the screen does not fall back to role names on
 * every refresh.
 * Sign-out clears the query cache. Until the first answer lands, and whenever the read fails,
 * `known` is false and every check falls back to the role names on the token, which is what the
 * console did before 4.7.
 */
export function useAccess(): Access {
    const { user } = useAuth();
    const token = useSyncExternalStore(subscribeToAuth, () => tokenStore.token, noTokenOnServer);
    const tenant = tenantOfToken(token);

    const { data: me } = useQuery({
        queryKey: ['me', user?.userId ?? null, tenant, tokenStamp(token)],
        queryFn: fetchMe,
        enabled: !!user,
        staleTime: ME_STALE_MS,
        // The previous token's answer, for the same user in the same tenant only. Another tenant's
        // capabilities are not this one's, so a switch falls back to role names until it lands.
        placeholderData: (previous, previousQuery) =>
            previousQuery?.queryKey[1] === (user?.userId ?? null) && previousQuery?.queryKey[2] === tenant
                ? previous
                : undefined,
        retry: false,
    });

    return useMemo(() => accessFrom(me, user?.roles), [me, user?.roles]);
}
