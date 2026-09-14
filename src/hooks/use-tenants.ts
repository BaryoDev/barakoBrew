'use client';

import { useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api, apiErrorMessage, tokenStore, subscribeToAuth, tenantOfToken, type Paginated } from '@/lib/api';

export interface TenantSummary {
  slug: string;
  name: string;
  logoUrl?: string | null;
  branding: Record<string, string>;
}

interface SwitchResponse {
  token: string;
  expiry: string;
  refreshToken: string;
  refreshTokenExpiry: string;
}

/** A full tenant record from the platform-admin tenants API (SuperAdmin only). */
export interface Tenant {
  id: string;
  slug: string;
  name: string;
  about?: string | null;
  logoUrl?: string | null;
  email?: string | null;
  location?: string | null;
  locationUrl?: string | null;
  socialHandle?: string | null;
  contactUrl?: string | null;
  /** Bare hosts the tenant answers on. Absent from an API older than custom domains. */
  domains?: string[];
  isActive: boolean;
}

export interface CreateTenantInput {
  Handle: string;
  Name: string;
  About?: string;
  IsActive: boolean;
}

/** Every tenant on the deployment (platform admin). Distinct from useMyTenants (only the caller's). */
export function useTenants() {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: async () => (await api.get<Paginated<Tenant>>('/api/tenants')).data.items,
  });
}

/** Create a tenant. The API also provisions the creator as an active admin member, so the new
 * tenant is immediately usable (and login to it isn't blocked by the cross-tenant token guard). */
export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTenantInput) =>
      (await api.post<Tenant>('/api/tenants', input)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'tenants'] });
    },
  });
}

/** The tenants the signed-in user belongs to (their active memberships). Empty on a single-tenant
 * deployment or for a user with no memberships. */
export function useMyTenants() {
  return useQuery({
    queryKey: ['me', 'tenants'],
    queryFn: async () => (await api.get<Paginated<TenantSummary>>('/api/me/tenants')).data.items,
    staleTime: 5 * 60 * 1000,
  });
}

/** The tenant the current token is scoped to (its `tenant` claim), reactive to sign-in/switch. */
export function useCurrentTenant(): string | null {
  return useSyncExternalStore(
    subscribeToAuth,
    () => tenantOfToken(tokenStore.token),
    () => null,
  );
}

/** Swap the session token for one scoped to another tenant the user belongs to (no re-auth). The new
 * token carries the tenant claim, so every subsequent request's X-Tenant follows automatically. */
export function useSwitchTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      const { data } = await api.post<SwitchResponse>('/api/me/switch', { Club: slug });
      tokenStore.set(data.token);
      return data;
    },
    onSuccess: () => {
      // Everything is tenant-scoped — drop all cached data so it refetches under the new tenant.
      queryClient.invalidateQueries();
    },
  });
}

/** How many domains the API lets one tenant hold (`TenantDomains.MaxPerTenant`). */
export const MAX_TENANT_DOMAINS = 20;

const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Why the API would refuse these domains, one message per problem, mirroring
 * `TenantDomains.Normalise`. A copy that can drift; the server still decides.
 */
export function domainProblems(domains: readonly string[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const raw of domains) {
    const typed = raw.trim();
    if (typed === '') {
      problems.push('A domain cannot be empty.');
      continue;
    }
    if (/[:/\\*@?# ]/.test(typed)) {
      problems.push(`'${typed}' is not a bare host. Enter it like example.com, without a scheme, port, path or wildcard.`);
      continue;
    }
    const host = typed.toLowerCase().replace(/\.$/, '');
    if (
      host.length > 253 ||
      /^\d+(\.\d+){3}$/.test(host) ||
      !host.includes('.') ||
      !host.split('.').every((label) => DOMAIN_LABEL.test(label))
    ) {
      problems.push(`'${typed}' is not a valid domain name.`);
      continue;
    }
    seen.add(host);
  }
  if (seen.size > MAX_TENANT_DOMAINS) problems.push(`A tenant can have at most ${MAX_TENANT_DOMAINS} domains.`);
  return problems;
}

/**
 * The body of `PUT /api/tenants/{handle}` that changes only the domains.
 *
 * The endpoint overwrites every profile field with what it is sent, so the rest of the tenant goes
 * back exactly as it was read. Sending `Domains` alone would blank the name, logo and contact
 * details.
 */
export function tenantDomainsBody(tenant: Tenant, domains: readonly string[]) {
  return {
    Handle: tenant.slug,
    Name: tenant.name,
    LogoUrl: tenant.logoUrl ?? null,
    About: tenant.about ?? null,
    Location: tenant.location ?? null,
    LocationUrl: tenant.locationUrl ?? null,
    SocialHandle: tenant.socialHandle ?? null,
    Email: tenant.email ?? null,
    ContactUrl: tenant.contactUrl ?? null,
    IsActive: tenant.isActive,
    Domains: domains.map((d) => d.trim()),
  };
}

export function useUpdateTenantDomains() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenant, domains }: { tenant: Tenant; domains: readonly string[] }) =>
      (await api.put<Tenant>(`/api/tenants/${encodeURIComponent(tenant.slug)}`, tenantDomainsBody(tenant, domains))).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
}

/** The API's own sentence when another tenant already holds a domain, otherwise null. */
export function domainClash(error: unknown): string | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null;
  return apiErrorMessage(error, 'Another tenant already holds one of these domains.');
}
