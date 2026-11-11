'use client';

import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { RevealOnce } from '@/components/patterns/reveal-once';
import { StatusBadge } from '@/components/patterns/status-badge';
import {
  DEFAULT_OVERLAP_INDEX,
  OVERLAP_STOPS,
  overlapLabel,
  timeLeft,
  useRevokeApiKey,
  useRotateApiKey,
  type ApiKey,
  type CreatedApiKey,
} from '@/hooks/use-api-keys';
import { ResponseShapeError, apiErrorMessage } from '@/lib/api';

/** What core says for the refusals the design does not draw. */
export function rotateRefusal(error: unknown): string {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 403) return 'You may not rotate this key.';
  if (error instanceof ResponseShapeError) return 'The key was issued but could not be shown. Revoke it in the list and rotate again.';
  if (status === 409) return 'The key changed while you were rotating it. Close this and try again.';
  return apiErrorMessage(error, 'Could not rotate the key.');
}

const mono = 'font-mono text-xs';

function Body({ target, onClose, onPending }: { target: ApiKey; onClose: () => void; onPending: (p: boolean) => void }) {
  const rotate = useRotateApiKey();
  const revoke = useRevokeApiKey();
  const [index, setIndex] = useState(DEFAULT_OVERLAP_INDEX);
  const [refused, setRefused] = useState('');
  // The secret lives here and nowhere else. Closing the rail unmounts this and it is gone.
  const [issued, setIssued] = useState<{ key: CreatedApiKey; oldStopsAt: string | null; at: number } | null>(null);
  const [stoppedNow, setStoppedNow] = useState(false);
  const minutes = OVERLAP_STOPS[index];

  async function issue() {
    setRefused('');
    onPending(true);
    try {
      const created = await rotate.mutateAsync({ id: target.id, overlapMinutes: minutes });
      // Core shortens the old key's expiry to the end of the window, or keeps an earlier one.
      const cutoff = Date.now() + minutes * 60_000;
      const earlier = target.expiresAt && Date.parse(target.expiresAt) < cutoff ? target.expiresAt : new Date(cutoff).toISOString();
      setIssued({ key: created, oldStopsAt: earlier, at: Date.now() });
      rotate.reset(); // the response carries the key, so drop it from the mutation cache now
    } catch (err) {
      setRefused(rotateRefusal(err));
    } finally {
      onPending(false);
    }
  }

  async function stopOldNow() {
    if (!window.confirm(`Stop "${target.name}" (${target.prefix}) now? Anything still using it gets 401 at once.`)) return;
    try {
      await revoke.mutateAsync(target.id);
      setStoppedNow(true);
      toast.success('Old key stopped. Anything still using it gets 401 now.');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not stop the old key.'));
    }
  }

  const stopsText = stoppedNow || !issued ? 'already stopped' : (timeLeft(issued.oldStopsAt, issued.at) ?? 'already stopped');

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto]">
      <div className="border-border grid gap-0.5 border-b px-5 py-[18px] pr-14">
        <SheetDescription className="text-xs">API keys / {target.name}</SheetDescription>
        <SheetTitle className="font-display text-[22px] font-semibold tracking-[-0.02em]">Rotate this key</SheetTitle>
      </div>

      <div className="grid content-start gap-5 overflow-auto p-5">
        {!issued ? (
          <>
            <p className="text-[14.5px] leading-relaxed text-pretty">
              A new key is issued with the same scopes. The old one, <span className="font-mono text-[13px]">{target.prefix}</span>,
              keeps working for the overlap window below, then stops. Deploy the new key before it does.
            </p>
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between">
                <label htmlFor="overlap" className="text-secondary-foreground text-[13px] font-semibold">
                  Overlap window
                </label>
                <span className="font-mono text-[13px]" data-testid="overlap-label">
                  {overlapLabel(minutes)}
                </span>
              </div>
              <input
                id="overlap"
                aria-label="Overlap window"
                type="range"
                min={0}
                max={OVERLAP_STOPS.length - 1}
                step={1}
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
                aria-valuetext={overlapLabel(minutes)}
                className="accent-primary w-full"
              />
              <div className="text-muted-foreground flex justify-between font-mono text-[11.5px]">
                <span>none</span>
                <span>60 min</span>
                <span>7 days</span>
              </div>
              <span className="text-muted-foreground text-[12.5px] leading-normal">
                60 minutes is the default and enough for a rolling deploy. Pick none only if the key has leaked.
              </span>
            </div>
            <div className="bg-secondary grid gap-1.5 rounded-[10px] px-3.5 py-3 text-[13px]">
              <span className="font-semibold">What stays the same</span>
              <span className="text-secondary-foreground flex flex-wrap items-center gap-1">
                Scopes
                {target.scopes.map((s) => (
                  <span key={s} className="bg-card rounded-full px-2 py-0.5 font-mono text-[11px]">
                    {s}
                  </span>
                ))}
                <span>· Types {target.contentTypes?.length ? target.contentTypes.join(', ') : 'Any'}</span>
              </span>
              {target.scopes.includes('*') && (
                <span className="text-muted-foreground text-xs leading-normal">
                  A <span className="font-mono">*</span> key does not include <span className="font-mono">files:read</span> or{' '}
                  <span className="font-mono">files:write</span>. Add them on a new key if this one needs files.
                </span>
              )}
            </div>
            {refused && (
              <p role="alert" className="text-destructive text-xs">
                {refused}
              </p>
            )}
          </>
        ) : (
          <>
            <RevealOnce
              title="New key issued"
              secret={issued.key.key}
              secretLabel="New API key"
              testId="rotated-key-secret"
              warning="Copy it now. It is not stored and cannot be shown again. Closing this rail removes it from the screen."
            >
              <p className="text-muted-foreground text-xs">
                Checklist: paste into the deploy secret, redeploy, watch Last used move to the new prefix.
              </p>
            </RevealOnce>
            <div className="border-border grid gap-1.5 rounded-[10px] border px-3.5 py-3 text-[13px]">
              <span className="flex justify-between gap-2.5">
                <span className="text-muted-foreground">Old key</span>
                <span className={mono}>{target.prefix}</span>
              </span>
              <span className="flex justify-between gap-2.5">
                <span className="text-muted-foreground">Stops working</span>
                <span className={`${mono} text-warning`} data-testid="old-stops">
                  {stopsText}
                </span>
              </span>
              {stoppedNow ? (
                <StatusBadge tone="muted" className="justify-self-start">
                  Old key stopped
                </StatusBadge>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive border-destructive/40 hover:text-destructive justify-self-start"
                  disabled={revoke.isPending || stopsText === 'already stopped'}
                  onClick={() => void stopOldNow()}
                >
                  Stop the old key now
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="border-border flex items-center gap-2 border-t px-5 py-3.5">
        <span className="text-muted-foreground flex-1 font-mono text-[11px]">POST /api/api-keys/{target.id}/rotate</span>
        {!issued ? (
          <>
            <Button type="button" variant="outline" onClick={onClose} disabled={rotate.isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void issue()} disabled={rotate.isPending}>
              {rotate.isPending ? 'Issuing…' : 'Issue new key'}
            </Button>
          </>
        ) : (
          <Button type="button" onClick={onClose}>
            I have copied it
          </Button>
        )}
      </div>
    </div>
  );
}

/** The 440px rail that rotates a key. Closing it unmounts the body, which is where the new secret lives. */
export function RotateRail({ target, onClose }: { target: ApiKey | null; onClose: () => void }) {
  // While the POST is out the key may already be issued, and closing would lose the only copy of it.
  const [pending, setPending] = useState(false);
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <SheetContent
        aria-label="Rotate key"
        showCloseButton={!pending}
        onEscapeKeyDown={(e) => pending && e.preventDefault()}
        onPointerDownOutside={(e) => pending && e.preventDefault()}
        onInteractOutside={(e) => pending && e.preventDefault()}
        className="w-[min(440px,100%)] gap-0 p-0 sm:max-w-[440px]"
      >
        {target && <Body key={target.id} target={target} onClose={onClose} onPending={setPending} />}
      </SheetContent>
    </Sheet>
  );
}
