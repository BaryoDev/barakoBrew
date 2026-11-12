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
    /** Members of the tenant. Null or absent when the API does not count them. */
    memberCount?: number | null;
    /** Live, Holding or Private. Read-only here: the tenants PUT cannot set it. Null when unset. */
    siteMode?: string | null;
    /** One entry per domain, with its ownership check. Absent from an API before domain checks. */
    domainStates?: DomainState[];
    /** NotSet, Closed, InviteOnly or Open. Null or absent when the API does not report it. */
    signUp?: string | null;
    /** The role a sign-up joins with. Set only when `signUp` is Open. */
    signUpRoleId?: string | null;
}

export interface DomainState {
    domain: string;
    status: 'Pending' | 'Verified' | string;
    txtName?: string | null;
    txtValue?: string | null;
    verifiedAt?: string | null;
}

export const SIGN_UPS = ['NotSet', 'Closed', 'InviteOnly', 'Open'] as const;

export const TENANT_STATUSES = ['Active', 'Suspended', 'Archived'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** What the Tenants list says a tenant is: its status when the API reports one, else the flag. */
export function tenantStatusLabel(tenant: Pick<Tenant, 'isActive' | 'status'>): string {
    return tenant.status ?? (tenant.isActive ? 'Active' : 'Inactive');
}

/** The fields the tenants write accepts. Anything else is left out of the body. */
export interface TenantWrite {
    /** Create only. A tenant's handle cannot change. */
    handle?: string;
    name: string;
    status: TenantStatus;
    signUp?: string | null;
    signUpRoleId?: string | null;
    domains: readonly string[];
}

/**
 * The body of `POST /api/tenants` and `PUT /api/tenants/{handle}`: Handle (create), Name, Status,
 * SignUp, SignUpRoleId and Domains, and nothing else. The status goes alone, never with the obsolete
 * active flag, which contract 8 refuses when the two disagree. The profile fields are not sent: the
 * API refuses a value in one. A role id goes only with Open, which is the only sign-up that takes one.
 * An empty domain list clears the domains; leaving the field out would keep them.
 */
export function tenantWriteBody(input: TenantWrite): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (input.handle !== undefined) body.Handle = input.handle;
    body.Name = input.name.trim();
    body.Status = input.status;
    if (input.signUp) body.SignUp = input.signUp;
    if (input.signUp === 'Open' && input.signUpRoleId) body.SignUpRoleId = input.signUpRoleId;
    body.Domains = input.domains.map((d) => d.trim());
    return body;
}
