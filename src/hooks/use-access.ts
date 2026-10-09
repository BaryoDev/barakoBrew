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

/**
 * What the signed-in caller may do, read once per session and tenant.
 *
 * The key holds the user and the tenant the token was minted for, so switching tenants reads again
 * and a refreshed token for the same tenant does not. Sign-out clears the query cache. Until the
 * answer lands, and whenever the read fails, `known` is false and every check falls back to the
 * role names on the token, which is what the console did before 4.7.
 */
export function useAccess(): Access {
    const { user } = useAuth();
    const token = useSyncExternalStore(subscribeToAuth, () => tokenStore.token, noTokenOnServer);
    const tenant = tenantOfToken(token);

    const { data: me } = useQuery({
        queryKey: ['me', user?.userId ?? null, tenant],
        queryFn: fetchMe,
        enabled: !!user,
        staleTime: Infinity,
        retry: false,
    });

    return useMemo(() => accessFrom(me, user?.roles), [me, user?.roles]);
}
