'use client';

import { useEffect } from 'react';
import { useApiMeta } from '@/hooks/use-meta';
import { useModules } from '@/hooks/use-modules';
import { useCurrentTenant, useMyTenants } from '@/hooks/use-tenants';
import { getApiUrl } from '@/lib/api';
import { rememberInstance } from '@/lib/remembered-instance';

/**
 * Keeps the sign-in card's facts for the next visit. Rendered only inside the signed-in shell, so
 * it cannot run for a failed attempt, and it reads only what a signed-in session may read.
 */
export function RememberInstance() {
    const slug = useCurrentTenant();
    const tenants = useMyTenants();
    const meta = useApiMeta();
    const modules = useModules();

    // Only once all three have answered and none is refetching, so a tenant switch cannot pair one
    // tenant's name with another's module count, and a half-loaded page cannot write a half record.
    // The slug is a handle, not a display name, so a tenant the list does not name is not written.
    const settled = [tenants, meta, modules].every((q) => q.isSuccess && !q.isFetching);
    const name = settled ? (tenants.data?.find((t) => t.slug === slug)?.name ?? null) : null;
    const version = settled ? meta.data?.version || null : null;
    const enabled =
        settled && modules.data?.kind === 'modules' ? modules.data.modules.filter((m) => m.enabled).length : null;

    useEffect(() => {
        if (name === null || version === null || enabled === null) return;
        let origin: string;
        try {
            origin = new URL(getApiUrl()).origin;
        } catch {
            return;
        }
        rememberInstance(origin, { name, version, modules: enabled });
    }, [name, version, enabled]);

    return null;
}
