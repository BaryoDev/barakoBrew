/**
 * Resolves held back so Undo can work. Core's resolve cannot be taken back, so a click hides the row
 * and the call goes out after a short wait. The store is module level, so the header, the card and
 * the list all count the same rows, and a held resolve outlives the card that started it.
 * A tab closed inside the wait loses the click. That is accepted: nothing was sent.
 */

interface Held {
  timer: ReturnType<typeof setTimeout>;
  sent: boolean;
}

const held = new Map<string, Held>();
let snapshot: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function publish() {
  snapshot = new Set(held.keys());
  for (const listener of listeners) listener();
}

export function subscribePending(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The ids hidden from Needs you: held, or sent and not yet gone from the refreshed list. */
export function pendingIds(): ReadonlySet<string> {
  return snapshot;
}

/** Hide `id` and run `send` after `ms`. */
export function hold(id: string, ms: number, send: () => void) {
  const existing = held.get(id);
  if (existing) clearTimeout(existing.timer);
  const entry: Held = {
    sent: false,
    timer: setTimeout(() => {
      entry.sent = true;
      send();
    }, ms),
  };
  held.set(id, entry);
  publish();
}

/** Undo. False, and nothing changes, once the call has gone out. */
export function cancel(id: string): boolean {
  const entry = held.get(id);
  if (!entry || entry.sent) return false;
  clearTimeout(entry.timer);
  held.delete(id);
  publish();
  return true;
}

/** Forget a row once its call settled (or was dropped), so it can show again if it comes back. */
export function release(id: string) {
  const entry = held.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  held.delete(id);
  publish();
}

/** Drop every held resolve unsent, for a tenant change. Sent ones are left to settle. */
export function cancelAll() {
  let changed = false;
  for (const [id, entry] of held) {
    if (entry.sent) continue;
    clearTimeout(entry.timer);
    held.delete(id);
    changed = true;
  }
  if (changed) publish();
}
