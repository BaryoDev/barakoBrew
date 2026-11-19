'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { z } from 'zod';
import { useCurrentTenant } from '@/hooks/use-tenants';
import { accessTokenExpired, api, beginSignOut, cancelSignOut, parseResponse, refreshSession, tokenStore } from '@/lib/api';

/** Optional text: anything that is not a string becomes absent, so a null or a number never reaches the screen. */
const optionalText = z.preprocess((v) => (typeof v === 'string' ? v : undefined), z.string().optional());

/**
 * One live session, from `GET /api/me/sessions` and `GET /api/users/{id}/sessions`.
 *
 * The device text and both addresses come from the client that signed in, so they are shown as text
 * and nothing else. Every field but the id and the two times is optional: a session from before the
 * API recorded them lists with those parts blank.
 */
export const sessionSchema = z.looseObject({
  id: z.string().min(1),
  device: optionalText,
  signInMethod: optionalText,
  signInIp: optionalText,
  lastSeenIp: optionalText,
  startedAt: z.string(),
  lastSeenAt: z.string(),
  current: z.boolean().optional().default(false),
});

export type Session = z.output<typeof sessionSchema>;

const sessionPageSchema = z.looseObject({ items: z.array(sessionSchema), hasNextPage: z.boolean().optional() });

/** Rows read at once. Core caps a page at 100, and a person rarely holds more. */
const PAGE_SIZE = 100;

/** The routes ship together, and an API without them answers 404. That is the one answer read as "not offered". */
export function isSessionsMissing(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

/** The sessions read, and whether the API holds more than one page of them. */
export interface SessionList {
  items: Session[];
  /** True when sessions past the first page exist. Core caps a page at 100, and none is fetched beyond it. */
  more: boolean;
}

async function readSessions(path: string): Promise<SessionList> {
  const { data } = await api.get<unknown>(path, { params: { pageSize: PAGE_SIZE } });
  const page = parseResponse(sessionPageSchema, data, `GET ${path.replace(/[0-9a-f-]{36}/i, '{id}')}`);
  return { items: page.items, more: page.hasNextPage === true };
}

/**
 * Whether this API has the session routes. Asks for one row and keeps the answer, so the rail and
 * the Users page agree without each asking again. `gone` is true only for a 404; any other failure
 * is an error and the answer stays unknown (not gone), so a slow network does not hide the page.
 */
export function useSessionsGone(enabled: boolean): boolean {
  const tenant = useCurrentTenant();
  const { data } = useQuery({
    queryKey: ['sessions-probe', tenant],
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<{ gone: boolean }> => {
      try {
        await api.get('/api/me/sessions', { params: { pageSize: 1 } });
        return { gone: false };
      } catch (error) {
        if (isSessionsMissing(error)) return { gone: true };
        throw error;
      }
    },
  });
  return data?.gone === true;
}

/**
 * The caller's own sessions. `null` when the API answers 404, so the page can say nothing is
 * offered instead of showing an error.
 */
export function useMySessions() {
  const tenant = useCurrentTenant();
  return useQuery({
    queryKey: ['sessions', 'me', tenant],
    retry: false,
    queryFn: async (): Promise<SessionList | null> => {
      try {
        return await readSessions('/api/me/sessions');
      } catch (error) {
        if (isSessionsMissing(error)) return null;
        throw error;
      }
    },
  });
}

/** DELETE /api/me/sessions/{id}. Ending the current session signs the caller out, which the page handles. */
export function useEndMySession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, current = false }: { id: string; current?: boolean }) => {
      // Ending the session this browser is using makes every request after the answer a 401. Sign-out
      // is marked first so the 401 handler does not refresh and hard-redirect on its own; the caller
      // runs the sign-out flow once this resolves.
      //
      // An expired access token is refreshed first: once sign-out is marked the 401 handler no longer
      // refreshes, so the DELETE would fail and the session would stay alive.
      if (current) {
        const token = tokenStore.token;
        if (token && accessTokenExpired(token)) {
          // No refresh cookie left: the tokens are cleared and there is nothing to end on the server,
          // so the caller goes straight to its sign-out flow.
          if ((await refreshSession()) === null) return { current: true };
        }
        beginSignOut();
      }
      try {
        await api.delete(`/api/me/sessions/${id}`);
      } catch (error) {
        if (current) cancelSignOut();
        throw error;
      }
      return { current };
    },
    // The current session is not read again: the list would answer 401, and the page is leaving.
    onSuccess: ({ current }) => (current ? undefined : queryClient.invalidateQueries({ queryKey: ['sessions'] })),
  });
}

/** POST /api/me/sessions/revoke-others: ends every session but the one this request came from. */
export function useEndOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post('/api/me/sessions/revoke-others');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

/**
 * One user's sessions, for a SuperAdmin. A 403 stays an error so the panel can say so; a 404 is
 * `null`, which the panel reads as the routes or the user being gone.
 */
export function useUserSessions(userId: string | null) {
  return useQuery({
    queryKey: ['sessions', 'user', userId],
    enabled: userId !== null,
    retry: false,
    queryFn: async (): Promise<SessionList | null> => {
      try {
        return await readSessions(`/api/users/${userId}/sessions`);
      } catch (error) {
        if (isSessionsMissing(error)) return null;
        throw error;
      }
    },
  });
}

/** DELETE /api/users/{id}/sessions/{sessionId}. */
export function useEndUserSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, sessionId }: { userId: string; sessionId: string }) => {
      await api.delete(`/api/users/${userId}/sessions/${sessionId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

/** DELETE /api/users/{id}/sessions: every session of the user. */
export function useEndAllUserSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/api/users/${userId}/sessions`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
}
