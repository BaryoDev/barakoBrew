"use client";

import { formatDistanceToNowStrict } from "date-fns";
import type { Session } from "@/hooks/use-sessions";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconTrash } from "@/components/icons";

const HEAD = "h-auto bg-background py-3";
const META = "text-muted-foreground font-mono text-[11.5px] tabular-nums";

function ago(value: string): string {
  const at = Date.parse(value);
  return Number.isFinite(at)
    ? formatDistanceToNowStrict(at, { addSuffix: true })
    : "Not recorded";
}

/**
 * The sessions of one account, as the caller's own page and the Users panel both draw them.
 *
 * The device text and the addresses are client input. They are rendered as React text children, so
 * markup in them shows as itself and is never parsed.
 */
export function SessionTable({
  sessions,
  onEnd,
  busy = false,
  more = false,
}: {
  sessions: Session[];
  onEnd: (session: Session) => void;
  /** True while a request is out, which stops a second click on another row. */
  busy?: boolean;
  /** True when the API holds more sessions than one page. Only the first page is read. */
  more?: boolean;
}) {
  return (
    <>
      <div className="bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-background">
              <TableHead className={`${HEAD} pl-6`}>Device</TableHead>
              <TableHead className={`${HEAD} hidden md:table-cell`}>
                Signed in with
              </TableHead>
              <TableHead className={`${HEAD} hidden sm:table-cell`}>
                Sign-in IP
              </TableHead>
              <TableHead className={`${HEAD} hidden sm:table-cell`}>
                Last seen IP
              </TableHead>
              <TableHead className={`${HEAD} hidden lg:table-cell`}>
                Started
              </TableHead>
              <TableHead className={HEAD}>Last seen</TableHead>
              <TableHead className={`${HEAD} pr-6 text-right`}>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => {
              const name = session.device || "Unknown device";
              return (
                <TableRow key={session.id} className="hover:bg-background">
                  <TableCell className="py-3.5 pl-6">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-bold">{name}</span>
                      {session.current && (
                        <StatusBadge tone="accent" dot={false}>
                          This device
                        </StatusBadge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className={`${META} hidden py-3.5 md:table-cell`}>
                    {session.signInMethod || "Not recorded"}
                  </TableCell>
                  <TableCell className={`${META} hidden py-3.5 sm:table-cell`}>
                    {session.signInIp || "Not recorded"}
                  </TableCell>
                  <TableCell className={`${META} hidden py-3.5 sm:table-cell`}>
                    {session.lastSeenIp || "Not recorded"}
                  </TableCell>
                  <TableCell className={`${META} hidden py-3.5 lg:table-cell`}>
                    {ago(session.startedAt)}
                  </TableCell>
                  <TableCell className={`${META} py-3.5`}>
                    {ago(session.lastSeenAt)}
                  </TableCell>
                  <TableCell className="py-3.5 pr-6 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onEnd(session)}
                      aria-label={`Sign out ${name}`}
                    >
                      <IconTrash />
                      Sign out
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {more && (
        <p className="text-muted-foreground mt-2 text-xs">
          Showing the first 100 sessions.
        </p>
      )}
    </>
  );
}
