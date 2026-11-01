'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { SECRET_MUTATION } from '@/lib/secrets';

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  tenantSlug: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revoked: boolean;
  createdAt: string;
  /**
   * The content types the key may push to, empty for no limit. Absent from an API older than the
   * one that added it (barakoCMS 4.4.0), which is how the screen knows to leave the control out.
   */
  contentTypes?: string[];
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  expiresAt?: string | null;
  /** Sent only when a type is chosen, so a key with none is minted with the body it always was. */
  contentTypes?: string[];
}

/** The create response — the only time the full secret (`key`) is ever returned. */
export interface CreatedApiKey extends ApiKey {
  key: string;
}

/** The scopes a key can hold. Mirrors the backend ApiKeyScopes; content surface only. */
export const API_KEY_SCOPES: { value: string; label: string; description: string }[] = [
  { value: 'content:read', label: 'Read content', description: 'List and read entries' },
  { value: 'content:write', label: 'Write content', description: 'Create, update and delete entries (not erase or rollback)' },
  {
    value: 'content:destructive',
    label: 'Erase and roll back content',
    description: 'Erase entries permanently and roll back versions',
  },
  { value: 'contenttype:read', label: 'Read content types', description: 'Read schemas' },
  { value: 'contenttype:write', label: 'Write content types', description: 'Create, update schemas' },
  { value: '*', label: 'Full content access', description: 'Everything on the content API' },
];

/** Scopes that allow changes nobody can undo, `*` included. Selecting one shows a warning before the key is created. */
export const DESTRUCTIVE_API_KEY_SCOPES = ['content:destructive', '*'];

/** The first barakoCMS release that takes `contentTypes` on a key. */
const CONTENT_TYPES_SINCE = [4, 4];

/**
 * Whether the API can limit a key to content types.
 *
 * The contract version does not move for an added field, so the answer comes from the shape: a
 * listed key carries `contentTypes` on an API that knows it, even when it names none. Only when
 * there is no key to read is the API's own version asked. An older API ignores a field it does
 * not know, so offering the control there would mint a key with no limit while the screen says it
 * has one.
 */
export function supportsKeyContentTypes(keys: ApiKey[] | undefined, apiVersion: string | undefined): boolean {
  if (keys && keys.length > 0) return keys.some((k) => Array.isArray(k.contentTypes));
  const match = /^(\d+)\.(\d+)\./.exec(apiVersion ?? '');
  if (!match) return false;
  const [major, minor] = [Number(match[1]), Number(match[2])];
  return major > CONTENT_TYPES_SINCE[0] || (major === CONTENT_TYPES_SINCE[0] && minor >= CONTENT_TYPES_SINCE[1]);
}

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => (await api.get<Paginated<ApiKey>>('/api/api-keys')).data.items,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateApiKeyInput) =>
      (await api.post<CreatedApiKey>('/api/api-keys', input)).data,
    ...SECRET_MUTATION,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export interface RotateApiKeyInput {
  id: string;
  /** Minutes the old key keeps working after the new one is issued. 0 to 10080. */
  overlapMinutes: number;
}

/** The overlap choices the rotate rail offers, in minutes. The API accepts 0 to 7 days. */
export const ROTATE_OVERLAPS: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'None' },
  { minutes: 15, label: '15 minutes' },
  { minutes: 60, label: '60 minutes' },
  { minutes: 6 * 60, label: '6 hours' },
  { minutes: 24 * 60, label: '24 hours' },
  { minutes: 3 * 24 * 60, label: '3 days' },
  { minutes: 7 * 24 * 60, label: '7 days' },
];

export const DEFAULT_ROTATE_OVERLAP_INDEX = ROTATE_OVERLAPS.findIndex((o) => o.minutes === 60);

const KEY_KINDS: { pattern: RegExp; label: string }[] = [
  { pattern: /^bcms_ro_/, label: 'Read-only' },
  { pattern: /^bcms_[^_]*$/, label: 'Standard' },
];

/** The first barakoCMS release with `POST /api/api-keys/{id}/rotate`. */
const ROTATE_SINCE = [5, 1];

/** Whether the API has the rotate route. An unknown version is taken as no. */
export function supportsKeyRotation(apiVersion: string | undefined): boolean {
  const match = /^(\d+)\.(\d+)\./.exec(apiVersion ?? '');
  if (!match) return false;
  const [major, minor] = [Number(match[1]), Number(match[2])];
  return major > ROTATE_SINCE[0] || (major === ROTATE_SINCE[0] && minor >= ROTATE_SINCE[1]);
}

/** The kind of key from its prefix. A prefix this console does not know is shown as it is. */
export function apiKeyKind(prefix: string): string {
  const known = KEY_KINDS.find((k) => k.pattern.test(prefix));
  if (known) return known.label;
  return /^[A-Za-z0-9]+_(?:[A-Za-z0-9]+_)?/.exec(prefix)?.[0] ?? prefix;
}

/** Issues a replacement key. The result carries the new secret, so it takes `SECRET_MUTATION`. */
export function useRotateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, overlapMinutes }: RotateApiKeyInput) =>
      (await api.post<CreatedApiKey>(`/api/api-keys/${id}/rotate`, { overlapMinutes })).data,
    ...SECRET_MUTATION,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/api-keys/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}
