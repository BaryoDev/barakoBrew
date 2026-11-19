'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import {
  useEndMySession,
  useEndOtherSessions,
  useMySessions,
  type Session,
} from '@/hooks/use-sessions';
import { apiErrorMessage } from '@/lib/api';
import { PageHeader } from '@/components/patterns/page-header';
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

export default function SessionsPage() {
  const { data, isLoading, isError, error, refetch } = useMySessions();
  const { logout } = useAuth();
  const endOne = useEndMySession();
  const endOthers = useEndOtherSessions();
  const [confirming, setConfirming] = useState<Session | null>(null);
  const [confirmingOthers, setConfirmingOthers] = useState(false);

  // null is the API saying it has no session routes. The rail has dropped the item by now, so the
  // page says so plainly rather than showing a failure nobody can act on.
  const sessions = data ?? [];
  const busy = endOne.isPending || endOthers.isPending;

  const onEnd = async () => {
    if (!confirming) return;
    const target = confirming;
    try {
      await endOne.mutateAsync(target.id);
      setConfirming(null);
      if (target.current) {
        // The API has ended this session, so the same flow as Sign out runs: it drops the token and
        // the cache and goes to the sign-in page.
        await logout();
        return;
      }
      toast.success('Signed out.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const onEndOthers = async () => {
    try {
      await endOthers.mutateAsync();
      setConfirmingOthers(false);
      toast.success('Signed out everywhere else.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Sessions"
        description="Where your account is signed in. Signing a session out ends it at once."
        actions={
          sessions.length > 1 ? (
            <Button variant="outline" onClick={() => setConfirmingOthers(true)} disabled={busy}>
              Sign out everywhere else
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState entity="sessions" error={error} onRetry={() => refetch()} />
      ) : data === null ? (
        <EmptyState
          icon={IconShield}
          title="Sessions are not available"
          description="This API does not list sessions."
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={IconShield}
          title="No sessions recorded"
          description="A session appears here when you sign in."
        />
      ) : (
        <SessionTable sessions={sessions} onEnd={setConfirming} busy={busy} />
      )}

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out this session?</DialogTitle>
            <DialogDescription>
              {confirming?.current
                ? 'This is the session you are using now. You will be signed out here and taken to the sign-in page.'
                : `${confirming?.device || 'This device'} will be signed out and will need to sign in again.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onEnd} disabled={endOne.isPending}>
              {endOne.isPending ? 'Signing out...' : 'Sign out'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingOthers} onOpenChange={setConfirmingOthers}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out everywhere else?</DialogTitle>
            <DialogDescription>
              Every other session ends. This one stays signed in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingOthers(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onEndOthers} disabled={endOthers.isPending}>
              {endOthers.isPending ? 'Signing out...' : 'Sign out everywhere else'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
