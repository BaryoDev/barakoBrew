'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  useAssignGroup,
  useBlockUser,
  useUnblockUser,
  useAssignRole,
  useRemoveGroup,
  useRemoveRole,
  useRoles,
  useUsers,
} from '@/hooks/use-rbac';
import { useUserGroups } from '@/hooks/use-user-groups';
import { useAuth } from '@/hooks/use-auth';
import { useSessionsGone } from '@/hooks/use-sessions';
import { UserSessionsPanel } from '@/components/sessions/user-sessions-panel';
import { isAxiosError } from 'axios';
import { apiErrorMessage, isNotFound } from '@/lib/api';
import { roleChangeErrorMessage } from '@/lib/global-roles';
import { isGlobalRoleCandidate, type User } from '@/types/rbac';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { PaginationControls } from '@/components/patterns/pagination-controls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IconPlus, IconTimes, IconUsers } from '@/components/icons';
import { format } from 'date-fns';

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const { data: users, isLoading, isError, refetch } = useUsers({ page });
  const { data: roles } = useRoles({ pageSize: 100 });
  const { data: groups } = useUserGroups();
  const { user: me } = useAuth();
  const block = useBlockUser();
  const unblock = useUnblockUser();
  const [sessionsOf, setSessionsOf] = useState<User | null>(null);
  const [blocking, setBlocking] = useState<{ user: User; action: 'block' | 'unblock' } | null>(null);
  // There is no read-only probe for the block routes (a POST changes state). Set when a block call
  // answers 404 with no error message: an API with the route names an unknown account, one without
  // it answers an empty 404. The actions go, with no toast.
  const [noBlock, setNoBlock] = useState(false);

  // Only a SuperAdmin is offered these: the API answers 403 to anyone else.
  const isSuperAdmin = me?.roles.includes('SuperAdmin') ?? false;
  const noSessions = useSessionsGone(isSuperAdmin);
  const showSessions = isSuperAdmin && !noSessions;
  const showBlock = isSuperAdmin && !noBlock;
  const showActions = showSessions || showBlock;

  const onConfirmBlock = async () => {
    if (!blocking) return;
    const { user, action } = blocking;
    try {
      await (action === 'block' ? block : unblock).mutateAsync(user.id);
      setBlocking(null);
      toast.success(action === 'block' ? `${user.username} is blocked.` : `${user.username} is unblocked.`);
    } catch (error) {
      setBlocking(null);
      if (isNotFound(error)) {
        // Core answers 404 for an unknown account with the FastEndpoints body, an object with an
        // `errors` field. Anything else (no body, or text or HTML from a proxy) means the route is
        // missing, so the actions go.
        const body = isAxiosError(error) ? error.response?.data : undefined;
        if (body !== null && typeof body === 'object' && 'errors' in body) {
          toast.error('That account no longer exists.');
          refetch();
        } else {
          setNoBlock(true);
        }
        return;
      }
      toast.error(apiErrorMessage(error));
    }
  };

  const roleName = (id: string) => roles?.items.find((r) => r.id === id)?.name ?? '…';
  const groupName = (id: string) => groups?.find((g) => g.id === id)?.name ?? '…';

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with an account. Users sign up through the API; here you control what they can do."
      />

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState entity="users" onRetry={() => refetch()} />
      ) : !users?.items.length ? (
        <EmptyState
          icon={IconUsers}
          title="No users yet"
          description="Accounts are created through the registration endpoint. New users start with the User role."
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="hidden lg:table-cell">Groups</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Joined</TableHead>
                  {showActions && (
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.items.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        {user.username}
                        {user.blocked === true && <Badge variant="destructive">Blocked</Badge>}
                      </div>
                      <div className="text-muted-foreground text-xs">{user.email}</div>
                    </TableCell>
                    <TableCell>
                      <MembershipCell
                        user={user}
                        assigned={user.roleIds}
                        nameOf={roleName}
                        options={
                          roles?.items.filter(isGlobalRoleCandidate).map((r) => ({ id: r.id, name: r.name })) ?? []
                        }
                        kind="role"
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <MembershipCell
                        user={user}
                        assigned={user.groupIds}
                        nameOf={groupName}
                        options={groups?.map((g) => ({ id: g.id, name: g.name })) ?? []}
                        kind="group"
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right text-sm sm:table-cell">
                      {format(new Date(user.createdAt), 'PP')}
                    </TableCell>
                    {showActions && (
                      <TableCell className="text-right whitespace-nowrap">
                        {/* Not on your own row: ending your own current session needs the sign-out flow, which the Sessions page runs. */}
                        {showSessions && user.id !== me?.userId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSessionsOf(user)}
                            aria-label={`Sessions for ${user.username}`}
                          >
                            Sessions
                          </Button>
                        )}
                        {/* Not on your own account: the API answers 400, so the control is left out. */}
                        {showBlock && user.id !== me?.userId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBlocking({ user, action: user.blocked === true ? 'unblock' : 'block' })}
                            aria-label={`${user.blocked === true ? 'Unblock' : 'Block'} ${user.username}`}
                          >
                            {user.blocked === true ? 'Unblock' : 'Block'}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationControls page={users} onPageChange={setPage} />
        </>
      )}

      {showSessions && <UserSessionsPanel user={sessionsOf} onClose={() => setSessionsOf(null)} />}

      <Dialog open={blocking !== null} onOpenChange={(open) => !open && setBlocking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{blocking?.action === 'unblock' ? 'Unblock this account?' : 'Block this account?'}</DialogTitle>
            <DialogDescription>
              {blocking?.action === 'unblock'
                ? `${blocking.user.username} can sign in again. Their API keys work again.`
                : `${blocking?.user.username} cannot sign in, their sessions end, and their API keys stop working until you unblock the account.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlocking(null)}>
              Cancel
            </Button>
            <Button
              variant={blocking?.action === 'unblock' ? 'default' : 'destructive'}
              onClick={onConfirmBlock}
              disabled={block.isPending || unblock.isPending}
            >
              {blocking?.action === 'unblock' ? 'Confirm unblock' : 'Confirm block'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MembershipCell({
  user,
  assigned,
  nameOf,
  options,
  kind,
}: {
  user: User;
  assigned: string[];
  nameOf: (id: string) => string;
  options: { id: string; name: string }[];
  kind: 'role' | 'group';
}) {
  const assignRole = useAssignRole();
  const removeRole = useRemoveRole();
  const assignGroup = useAssignGroup();
  const removeGroup = useRemoveGroup();

  const available = options.filter((o) => !assigned.includes(o.id));

  const onError = (error: unknown) =>
    toast.error(kind === 'role' ? roleChangeErrorMessage(error) : apiErrorMessage(error, 'The group could not be changed.'));

  const add = (id: string) => {
    if (kind === 'role') assignRole.mutate({ userId: user.id, roleId: id }, { onError });
    else assignGroup.mutate({ userId: user.id, groupId: id }, { onError });
  };

  const remove = (id: string) => {
    if (kind === 'role') removeRole.mutate({ userId: user.id, roleId: id }, { onError });
    else removeGroup.mutate({ userId: user.id, groupId: id }, { onError });
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {assigned.map((id) => (
        <Badge key={id} variant="secondary" className="gap-1 font-normal">
          {nameOf(id)}
          <button
            type="button"
            aria-label={`Remove ${kind} ${nameOf(id)} from ${user.username}`}
            onClick={() => remove(id)}
          >
            <IconTimes className="size-3" />
          </button>
        </Badge>
      ))}
      {available.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Add ${kind} to ${user.username}`}
            >
              <IconPlus className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Add {kind}</DropdownMenuLabel>
            {available.map((option) => (
              <DropdownMenuItem key={option.id} onClick={() => add(option.id)}>
                {option.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
