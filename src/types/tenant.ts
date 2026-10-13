// The tenant as the platform-admin tenants API answers it, and the body that writes one back. Kept
// apart from the hooks, with no imports, so the unmocked pack can hold the console's own write against
// the real API.

/** A full tenant record from the platform-admin tenants API (SuperAdmin only). */
export interface Tenant {
    id: string;
    slug: string;
    name: string;
    /** Bare hosts the tenant answers on. Absent from an API older than custom domains. */
    domains?: string[];
    /** True when the tenant is served. From contract 8 it is derived from `status`. */
    isActive: boolean;
    /**
     * Whether the tenant is served. A Suspended or Archived tenant answers 404 on delivery and 403 to
     * its own signed-in callers. Absent from an API before contract 8, which has only `isActive`.
     */
    status?: TenantStatus;
}

export const TENANT_STATUSES = ['Active', 'Suspended', 'Archived'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** What the Tenants list says a tenant is: its status when the API reports one, else the flag. */
export function tenantStatusLabel(tenant: Pick<Tenant, 'isActive' | 'status'>): string {
    return tenant.status ?? (tenant.isActive ? 'Active' : 'Inactive');
}

/**
 * The profile fields an API before 4.6 kept on the tenant record, as it answered them and as its
 * update takes them. barakoCMS 4.6 moved them to the tenant's site entry (BaryoDev/barakoCMS#885).
 */
const LEGACY_PROFILE = [
    ['logoUrl', 'LogoUrl'],
    ['about', 'About'],
    ['location', 'Location'],
    ['locationUrl', 'LocationUrl'],
    ['socialHandle', 'SocialHandle'],
    ['email', 'Email'],
    ['contactUrl', 'ContactUrl'],
] as const;

/**
 * The body of `PUT /api/tenants/{handle}` that changes only the domains.
 *
 * The name and the status (before contract 8, the active flag) go back as they were read. A profile
 * field goes back only when the tenant answer carried it: an API before 4.6 overwrites every profile
 * field with what it is sent, so leaving one out there would blank it, and API 4.6 answers with none
 * of them and keeps what the record holds when they are left out.
 */
export function tenantDomainsBody(tenant: Tenant, domains: readonly string[]): Record<string, unknown> {
    const read = tenant as Tenant & Record<string, unknown>;
    const body: Record<string, unknown> = { Handle: tenant.slug, Name: tenant.name };
    for (const [answered, sent] of LEGACY_PROFILE) {
        if (answered in read) body[sent] = read[answered] ?? null;
    }
    // From contract 8 a write naming neither the status nor the flag makes the tenant Active, and the
    // flag is obsolete, so the status goes back as read. An older API reports only the flag.
    if (tenant.status) body.Status = tenant.status;
    else body.IsActive = tenant.isActive;
    body.Domains = domains.map((d) => d.trim());
    return body;
}
