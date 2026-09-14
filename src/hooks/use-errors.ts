import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Paginated } from '@/lib/api';

// Mirrors the BarakoCMS.Diagnostics client-error module responses (camelCase over the wire).

export type ErrorKind = 'error' | 'unhandledrejection' | 'react' | 'api';
export type ErrorSeverity = 'error' | 'warning';

export interface ClientErrorDto {
  id: string;
  kind: string;
  severity: string;
  message: string;
  stack?: string | null;
  source?: string | null;
  status?: number | null;
  url?: string | null;
  userAgent?: string | null;
  appVersion?: string | null;
  tenant?: string | null;
  username?: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolved?: boolean;
  // Absent on an API older than BaryoDev/barakoCMS#790, which is why every one is optional.
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolutionReference?: string | null;
  resolutionNote?: string | null;
}

/** The API's limits on what a resolve can carry, so the dialog refuses before the server does. */
export const MAX_REFERENCE_LENGTH = 500;
export const MAX_NOTE_LENGTH = 2000;

export interface ResolveInput {
  id: string;
  reference?: string;
  note?: string;
}

/** The resolve body: trimmed, with blank fields left off so an empty dialog resolves as before. */
export function resolveBody(input: Pick<ResolveInput, 'reference' | 'note'>): {
  reference?: string;
  note?: string;
} {
  const body: { reference?: string; note?: string } = {};
  const reference = input.reference?.trim();
  const note = input.note?.trim();
  if (reference) body.reference = reference;
  if (note) body.note = note;
  return body;
}

/**
 * A reference as a link, or null when it is not one. Only http and https: a reference is typed by a
 * person and rendered as an href, and a `javascript:` value there would run on click.
 */
export function referenceHref(reference?: string | null): string | null {
  if (!reference) return null;
  try {
    const url = new URL(reference.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export interface ClientErrorsQuery {
  page?: number;
  pageSize?: number;
  resolved?: boolean; // undefined = all
  severity?: ErrorSeverity; // undefined = all
  q?: string;
}

export interface ClientErrorsResult {
  items: ClientErrorDto[];
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// The backend may return the standard Paginated<T> envelope or a bare array
// (depending on the module version). Normalise both into ClientErrorsResult.
function normalize(
  data: Paginated<ClientErrorDto> | ClientErrorDto[],
  page: number,
  pageSize: number,
): ClientErrorsResult {
  if (Array.isArray(data)) {
    return {
      items: data,
      totalItems: data.length,
      page,
      pageSize,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    };
  }
  return {
    items: data.items ?? [],
    totalItems: data.totalItems ?? 0,
    page: data.page ?? page,
    pageSize: data.pageSize ?? pageSize,
    totalPages: data.totalPages ?? 1,
    hasNextPage: data.hasNextPage ?? false,
    hasPreviousPage: data.hasPreviousPage ?? false,
  };
}

export function useClientErrors(query: ClientErrorsQuery) {
  const { page = 1, pageSize = 25, resolved, severity, q } = query;
  return useQuery({
    queryKey: ['client-errors', { page, pageSize, resolved, severity, q }],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = { page, pageSize };
      if (resolved !== undefined) params.resolved = resolved;
      if (severity) params.severity = severity;
      if (q) params.q = q;
      const response = await api.get<Paginated<ClientErrorDto> | ClientErrorDto[]>(
        '/api/client-errors',
        { params },
      );
      return normalize(response.data, page, pageSize);
    },
  });
}

export function useResolveClientError() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: ResolveInput) => {
      await api.post(`/api/client-errors/${id}/resolve`, resolveBody(rest));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-errors'] });
    },
  });
}
