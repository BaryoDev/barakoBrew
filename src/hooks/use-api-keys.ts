'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
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
  /**
   * Rotation links, from barakoCMS 5.6 on. `replacedBy` is the id of the key that took over from
   * this one, so an old key with a shortened expiry reads as overlap and not as an ordinary expiry;
   * `replaces` is the id of the key this one took over from. `kind` is user, servicePrincipal or
   * readOnly. All absent on an older API, and null on a key made before they were recorded.
   */
  replacedBy?: string | null;
  replaces?: string | null;
  kind?: string | null;
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

/**
 * The key list. The rotation fields are read leniently: each is optional, and anything that is not
 * a string becomes absent, so an API that does not send them, or sends something else, still lists.
 */
const optionalString = z.preprocess((v) => (typeof v === 'string' ? v : undefined), z.string().optional());

export const apiKeyRotationSchema = z.looseObject({
  replacedBy: optionalString,
  replaces: optionalString,
  kind: optionalString,
});

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const items = (await api.get<Paginated<ApiKey>>('/api/api-keys')).data.items;
      return items.map((k): ApiKey => {
        const { replacedBy, replaces, kind } = apiKeyRotationSchema.parse(k);
        return { ...k, replacedBy, replaces, kind };
      });
    },
  });
}

/** The overlap stops the rotate rail offers, in minutes. Core accepts any 0 to 10080. */
export const OVERLAP_STOPS = [0, 15, 60, 240, 1440, 4320, 10080] as const;
export const DEFAULT_OVERLAP_INDEX = 2;

/** "none", "15 min", "60 min", "4 h", "24 h", "3 days", "7 days". */
export function overlapLabel(minutes: number): string {
  if (minutes === 0) return 'none';
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return '60 min';
  if (minutes < 1440) return `${minutes / 60} h`;
  if (minutes === 1440) return '24 h';
  return `${minutes / 1440} days`;
}

/**
 * How long an old key has left, as "in 60 min" or "already stopped". Null when the key has no expiry
 * or `expiresAt` does not parse.
 */
export function timeLeft(expiresAt: string | null | undefined, now: number): string | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return null;
  const minutes = Math.ceil((at - now) / 60_000);
  if (minutes <= 0) return 'already stopped';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} days`;
}

/**
 * Whether a key is in its overlap: it has been replaced and has not yet stopped. Needs the marker
 * (`replacedBy`); without it there is no telling an overlap from an ordinary expiry, so this is false.
 */
export function inOverlap(key: ApiKey, now: number): boolean {
  if (key.revoked || !key.replacedBy || !key.expiresAt) return false;
  const at = Date.parse(key.expiresAt);
  return Number.isFinite(at) && at > now;
}

export interface RotateApiKeyInput {
  id: string;
  overlapMinutes: number;
}

/** POST /api/api-keys/{id}/rotate. Answers like create, with the new key's secret once. */
export function useRotateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, overlapMinutes }: RotateApiKeyInput) =>
      (await api.post<CreatedApiKey>(`/api/api-keys/${id}/rotate`, { overlapMinutes })).data,
    ...SECRET_MUTATION,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
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

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/api-keys/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}
