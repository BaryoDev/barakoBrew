'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  isSessionsMissing,
  useEndAllUserSessions,
  useEndUserSession,
  useUserSessions,
  type Session,
} from '@/hooks/use-sessions';
import { apiErrorMessage, isForbidden } from '@/lib/api';
import type { User } from '@/types/rbac';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { SessionTable } from '@/components/sessions/session-table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IconShield } from '@/components/icons';

/**
 * One user's sessions, for a SuperAdmin. Opened from the Users list, which has no detail page.
 *
 * A 404 on the list means the user is gone since the list loaded (the routes themselves are checked
 * by the rail probe), so the panel closes, the Users list is read again and a toast says so. A 403 shows
 * the server's reason in the panel, or the standard message when it gives none, never a blank one.
 */
export function UserSessionsPanel({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useUserSessions(user?.id ?? null);
  const endOne = useEndUserSession();
  const endAll = useEndAllUserSessions();
  const [confirmingAll, setConfirmingAll] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (user && data === null) {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.error('That account no longer exists.');
      onClose();
    }
  }, [user, data, onClose, queryClient]);

  const sessions = data?.items ?? [];
  const busy = endOne.isPending || endAll.isPending;

  const onError = (err: unknown) => {
    // A session that is already gone answers 404. Reading the list again shows it gone; a toast
    // would only report that the thing the admin wanted is already true.
    if (isSessionsMissing(err)) {
      void refetch();
      return;
    }
    toast.error(apiErrorMessage(err));
  };

  const end = async (session: Session) => {
    if (!user) return;
    try {
      await endOne.mutateAsync({ userId: user.id, sessionId: session.id });
      toast.success('Session signed out.');
    } catch (err) {
      onError(err);
    }
  };

  const endEvery = async () => {
    if (!user) return;
    try {
      await endAll.mutateAsync(user.id);
      setConfirmingAll(false);
      toast.success(`${user.username} is signed out everywhere.`);
    } catch (err) {
      setConfirmingAll(false);
      onError(err);
    }
  };

  return (
    <>
      <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Sessions for {user?.username}</DialogTitle>
            <DialogDescription>
              Where this account is signed in, across every tenant. Ending a session signs that browser out.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <TableSkeleton />
          ) : isError && isForbidden(error) ? (
            <p role="alert" className="text-destructive py-8 text-center text-sm">
              {apiErrorMessage(error)}
            </p>
          ) : isError ? (
            <ErrorState
              entity="sessions"
              error={error}
              onRetry={() => refetch()}
              className="py-8"
            />
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={IconShield}
              title="No sessions"
              description="This account is not signed in anywhere."
            />
          ) : (
            <SessionTable sessions={sessions} onEnd={end} busy={busy} more={data?.more} />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {sessions.length > 0 && (
              <Button variant="destructive" onClick={() => setConfirmingAll(true)} disabled={busy}>
                Sign out everywhere
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingAll} onOpenChange={setConfirmingAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out everywhere?</DialogTitle>
            <DialogDescription>
              Every session of {user?.username} ends. They will need to sign in again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingAll(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={endEvery} disabled={endAll.isPending}>
              {endAll.isPending ? 'Signing out...' : 'Confirm sign out'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
